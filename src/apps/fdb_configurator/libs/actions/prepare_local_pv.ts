import { createCliAction, ExitCode } from "../../../../deps/cli_utils.ts";
import { joinPath } from "../../../../deps/std_path.ts";
import { Type } from "../../../../deps/typebox.ts";
import { NonEmptyString } from "../types.ts";
import { captureExec, inheritExec } from "../../../../deps/exec_utils.ts";
import { kubectlGetJson, kubectlInherit, toRootElevatedCommand } from "../utils.ts";
import { Logger } from "../../../../libs/logger.ts";

const logger = new Logger();

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
      args: [`node/${nodeName}`, "-o=jsonpath={.metadata.annotations}"],
      schema: Type.Record(Type.String(), Type.String()),
    });

    const deviceIdsString = (typeof nodeAnnotations[pendingDeviceIdsAnnotationName] === "string")
      ? nodeAnnotations[pendingDeviceIdsAnnotationName]
      : "";
    const deviceIds = deviceIdsString.split(",");

    if (deviceIds.length === 0) {
      logger.info({ msg: `Node annotation '${pendingDeviceIdsAnnotationName}' is empty, nothing to do` });
    } else {
      logger.info({ msg: `Going to prepare the following ${deviceIds.length} devices: ${deviceIds.join(", ")}` });

      for (const deviceId of deviceIds) {
        const devicePath = joinPath("/dev/disk/by-id", deviceId);

        const deviceMountTargetPath = joinPath(rootMountPath, "dev", deviceId);
        const storageMountSourcePath = joinPath(deviceMountTargetPath, "storage");
        const logMountSourcePath = joinPath(deviceMountTargetPath, "log");

        const storageBindMountTargetPath = joinPath(rootMountPath, "storage", deviceId);
        const logBindMountTargetPath = joinPath(rootMountPath, "log", deviceId);

        const cmd = toRootElevatedCommand(["mountpoint", deviceMountTargetPath]);
        const mountpointCheck = await new Deno.Command(cmd[0], {
          args: cmd.slice(1),
          stdout: "null",
          stderr: "null",
        }).output();

        const isMounted = mountpointCheck.code === 0;

        if (!isMounted) {
          logger.info({ msg: `${deviceMountTargetPath} is not mounted` });
          logger.info({ msg: `Checking for existing file system inside ${devicePath}` });

          const wipefsTest = (await captureExec({
            cmd: toRootElevatedCommand(["wipefs", "-a", "-n", devicePath]),
          })).out;

          if (wipefsTest.trim().length > 0) {
            logger.error({
              msg: `Device possibly contains an existing file system, wipefs test output: ${wipefsTest}`,
            });
            return ExitCode.One;
          }

          logger.info({ msg: `Making sure /etc/fstab does not already contain a reference to ${devicePath}` });
          const currentFstabContent = (await captureExec({
            cmd: toRootElevatedCommand(["cat", "/etc/fstab"]),
          })).out;

          if (currentFstabContent.indexOf(devicePath) !== -1) {
            logger.error({ msg: `Device ${devicePath} found inside /etc/fstab` });
            return ExitCode.One;
          }

          logger.info({ msg: `Formatting ${devicePath}` });
          await inheritExec({ cmd: toRootElevatedCommand(["mkfs.ext4", devicePath]) });

          logger.info({ msg: `Writing to /etc/fstab` });
          await inheritExec({
            cmd: toRootElevatedCommand(["tee", "/etc/fstab"]),
            stdin: {
              pipe: currentFstabContent + "\n" +
                `${devicePath}  ${deviceMountTargetPath}  ext4  defaults,noatime,discard,nofail  0 0
${storageMountSourcePath}  ${storageBindMountTargetPath}  none  bind  0 0
${logMountSourcePath}  ${logBindMountTargetPath}  none  bind  0 0
`,
            },
          });

          logger.info({ msg: `Creating mount paths` });
          await inheritExec({
            cmd: toRootElevatedCommand([
              "mkdir",
              "-p",
              deviceMountTargetPath,
              storageBindMountTargetPath,
              logBindMountTargetPath,
            ]),
          });

          logger.info({ msg: `Making mount target paths immutable` });
          await inheritExec({
            cmd: toRootElevatedCommand([
              "chattr",
              "+i",
              deviceMountTargetPath,
              storageBindMountTargetPath,
              logBindMountTargetPath,
            ]),
          });

          logger.info({ msg: `Mounting ${devicePath} to ${deviceMountTargetPath}` });
          await inheritExec({
            cmd: toRootElevatedCommand(["mount", `--source=${devicePath}`]),
          });

          logger.info({
            msg: `Creating bind-mount source paths: ${storageMountSourcePath} and ${logMountSourcePath}`,
          });
          await inheritExec({
            cmd: toRootElevatedCommand(["mkdir", "-p", storageMountSourcePath, logMountSourcePath]),
          });

          logger.info({ msg: `Bind-mounting ${storageMountSourcePath} to ${storageBindMountTargetPath}` });
          await inheritExec({
            cmd: toRootElevatedCommand([
              "mount",
              `--source=${storageMountSourcePath}`,
            ]),
          });

          logger.info({ msg: `Bind-mounting ${logMountSourcePath} to ${logBindMountTargetPath}` });
          await inheritExec({
            cmd: toRootElevatedCommand([
              "mount",
              `--source=${logMountSourcePath}`,
            ]),
          });
        } else {
          logger.info({ msg: `${deviceMountTargetPath} is already a mountpoint, nothing to do` });
        }
      }
    }

    logger.info(
      { msg: `Removing '${pendingDeviceIdsAnnotationName}' annotation from node ${nodeName}` },
    );
    await kubectlInherit({
      args: ["annotate", `node/${nodeName}`, `${pendingDeviceIdsAnnotationName}-`],
    });

    logger.info(
      { msg: `Setting label '${pendingLabelName}=${pendingLabelCompletedValue}' for node ${nodeName}` },
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
