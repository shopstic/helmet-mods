import { takoRun } from "./run.ts";
import { CliProgram } from "@wok/utils/cli";

try {
  await new CliProgram()
    .addAction("run", takoRun)
    .run(Deno.args);
} catch (e) {
  console.error(e);
  Deno.exit(1);
}
