import configure from "./libs/actions/configure.ts";
import createConnectionString from "./libs/actions/create-connection-string.ts";
import syncConnectionString from "./libs/actions/sync-connection-string.ts";
import prepareLocalPv from "./libs/actions/prepare-local-pv.ts";
import { CliProgram } from "./libs/deps/cli-utils.ts";

await new CliProgram()
  .addAction("prepare-local-pv", prepareLocalPv)
  .addAction("configure", configure)
  .addAction("create-connection-string", createConnectionString)
  .addAction("sync-connection-string", syncConnectionString)
  .run(Deno.args);
