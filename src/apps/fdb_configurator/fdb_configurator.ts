import configure from "./libs/actions/configure.ts";
import createConnectionString from "./libs/actions/create_connection_string.ts";
import syncConnectionString from "./libs/actions/sync_connection_string.ts";
import prepareLocalPv from "./libs/actions/prepare_local_pv.ts";
import { CliProgram } from "../../deps/cli_utils.ts";

await new CliProgram()
  .addAction("prepare-local-pv", prepareLocalPv)
  .addAction("configure", configure)
  .addAction("create-connection-string", createConnectionString)
  .addAction("sync-connection-string", syncConnectionString)
  .run(Deno.args);
