import { createCliAction, ExitCode } from "../deps/cli-utils.ts";
import { joinPath } from "../deps/std-path.ts";
import { Type } from "../deps/typebox.ts";
import { NonEmptyString } from "../types.ts";
import { captureExec, inheritExec } from "../deps/exec-utils.ts";
import {
  kubectlGetJson,
  kubectlInherit,
  toRootElevatedCommand,
} from "../utils.ts";
import { loggerWithContext } from "../logger.ts";

const logger = loggerWithContext("main");

export default createCliAction(
  Type.Object({
    nodeNameEnvVarName: NonEmptyString(),
    pendingLabelName: NonEmptyString(),
    pendingLabelCompletedValue: NonEmptyString(),
    pendingDeviceIdsAnnotationName: NonEmptyString(),
    rootMountPath: NonEmptyString(),
  }),
  async (
    {
      nodeNameEnvVarName,
      pendingLabelName,
      pendingLabelCompletedValue,
      pendingDeviceIdsAnnotationName,
      rootMountPath,
    },
  ) => {
    const nodeName = Deno.env.get(nodeNameEnvVarName);

    if (!nodeName) {
      throw new Error(`${nodeNameEnvVarName} env variable is not set`);
    }

    const nodeAnnotations = await kubectlGetJson({
      args: [
        `node/${nodeName}`,
        "-o=jsonpath={.metadata.annotations}",
      ],
      schema: Type.Dict(Type.String()),
    });

    const deviceIdsString =
      (typeof nodeAnnotations[pendingDeviceIdsAnnotationName] === "string")
        ? nodeAnnotations[pendingDeviceIdsAnnotationName]
        : "";
    const deviceIds = deviceIdsString.split(",");

    if (deviceIds.length === 0) {
      logger.info(
        `Node annotation '${pendingDeviceIdsAnnotationName}' is empty, nothing to do`,
      );
    } else {
      logger.info(
        `Going to prepare the following ${deviceIds.length} devices: ${
          deviceIds.join(", ")
        }`,
      );

      for (const deviceId of deviceIds) {
        const devicePath = joinPath(
          "/dev/disk/by-id",
          deviceId,
        );

        const deviceMountTargetPath = joinPath(rootMountPath, "dev", deviceId);
        const storageMountSourcePath = joinPath(
          deviceMountTargetPath,
          "storage",
        );
        const logMountSourcePath = joinPath(deviceMountTargetPath, "log");

        const storageBindMountTargetPath = joinPath(
          rootMountPath,
          "storage",
          deviceId,
        );
        const logBindMountTargetPath = joinPath(rootMountPath, "log", deviceId);

        const mountpointCheck = Deno.run({
          cmd: toRootElevatedCommand(["mountpoint", deviceMountTargetPath]),
          stdout: "null",
          stderr: "null",
        });
        const isMounted = (await mountpointCheck.status()).code === 0;

        if (!isMounted) {
          logger.info(`${deviceMountTargetPath} is not mounted`);
          logger.info(`Checking for existing file system inside ${devicePath}`);

          const wipefsTest = await captureExec({
            run: {
              cmd: toRootElevatedCommand(["wipefs", "-a", "-n", devicePath]),
            },
          });

          if (wipefsTest.trim().length > 0) {
            logger.error(
              `Device possibly contains an existing file system, wipefs test output: ${wipefsTest}`,
            );
            return ExitCode.One;
          }

          logger.info(
            `Making sure /etc/fstab does not already contain a reference to ${devicePath}`,
          );
          const currentFstabContent = await captureExec({
            run: { cmd: toRootElevatedCommand(["cat", "/etc/fstab"]) },
          });

          if (currentFstabContent.indexOf(devicePath) !== -1) {
            logger.error(
              `Device ${devicePath} found inside /etc/fstab`,
            );
            return ExitCode.One;
          }

          logger.info(`Formatting ${devicePath}`);
          await inheritExec({
            run: { cmd: toRootElevatedCommand(["mkfs.ext4", devicePath]) },
          });

          logger.info(`Writing to /etc/fstab`);
          await inheritExec({
            run: { cmd: toRootElevatedCommand(["tee", "/etc/fstab"]) },
            stdin: currentFstabContent + "\n" +
              `${devicePath}  ${deviceMountTargetPath}  ext4  defaults,noatime,discard,nofail  0 0
${storageMountSourcePath}  ${storageBindMountTargetPath}  none  bind  0 0
${logMountSourcePath}  ${logBindMountTargetPath}  none  bind  0 0
`,
          });

          logger.info(`Creating mount paths`);
          await inheritExec({
            run: {
              cmd: toRootElevatedCommand([
                "mkdir",
                "-p",
                deviceMountTargetPath,
                storageBindMountTargetPath,
                logBindMountTargetPath,
              ]),
            },
          });

          logger.info(`Making mount target paths immutable`);
          await inheritExec({
            run: {
              cmd: toRootElevatedCommand([
                "chattr",
                "+i",
                deviceMountTargetPath,
                storageBindMountTargetPath,
                logBindMountTargetPath,
              ]),
            },
          });

          logger.info(`Mounting ${devicePath} to ${deviceMountTargetPath}`);
          await inheritExec({
            run: {
              cmd: toRootElevatedCommand(["mount", `--source=${devicePath}`]),
            },
          });

          logger.info(
            `Creating bind-mount source paths: ${storageMountSourcePath} and ${logMountSourcePath}`,
          );
          await inheritExec({
            run: {
              cmd: toRootElevatedCommand([
                "mkdir",
                "-p",
                storageMountSourcePath,
                logMountSourcePath,
              ]),
            },
          });

          logger.info(
            `Bind-mounting ${storageMountSourcePath} to ${storageBindMountTargetPath}`,
          );
          await inheritExec({
            run: {
              cmd: toRootElevatedCommand([
                "mount",
                `--source=${storageMountSourcePath}`,
              ]),
            },
          });

          logger.info(
            `Bind-mounting ${logMountSourcePath} to ${logBindMountTargetPath}`,
          );
          await inheritExec({
            run: {
              cmd: toRootElevatedCommand([
                "mount",
                `--source=${logMountSourcePath}`,
              ]),
            },
          });
        } else {
          logger.info(
            `${deviceMountTargetPath} is already a mountpoint, nothing to do`,
          );
        }
      }
    }

    logger.info(
      `Removing '${pendingDeviceIdsAnnotationName}' annotation from node ${nodeName}`,
    );
    await kubectlInherit({
      args: [
        "annotate",
        `node/${nodeName}`,
        `${pendingDeviceIdsAnnotationName}-`,
      ],
    });

    logger.info(
      `Setting label '${pendingLabelName}=${pendingLabelCompletedValue}' for node ${nodeName}`,
    );
    await kubectlInherit({
      args: [
        "label",
        "--overwrite",
        `node/${nodeName}`,
        `${pendingLabelName}=${pendingLabelCompletedValue}`,
      ],
    });

    return ExitCode.Zero;
  },
);
