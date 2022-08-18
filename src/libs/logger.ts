import { ConsoleStream, Logger, TokenReplacer } from "../deps/optic.ts";
import { exhaustiveMatchingGuard } from "./utils.ts";

export function loggerWithContext(ctx: string): Logger {
  return new Logger()
    .addStream(
      new ConsoleStream()
        .withLogHeader(false)
        .withLogFooter(false)
        .withFormat(
          new TokenReplacer()
            .withFormat(`{dateTime} [{level}][${ctx}] {msg} {metadata}`)
            .withDateTimeFormat("YYYY-MM-DD hh:mm:ss")
            .withLevelPadding(0)
            .withColor(false),
        ),
    );
}

function serializeLog(event: unknown) {
  return JSON.stringify(event, (_, value) => {
    if (value instanceof Error) {
      // deno-lint-ignore no-explicit-any
      return Object.fromEntries(Object.getOwnPropertyNames(value).map((k) => [k, (value as any)[k]]));
    }
    return value;
  });
}

export class Logger2 {
  context: Record<string, unknown>;
  constructor(initialContext: Record<string, unknown> = {}) {
    this.context = initialContext;
  }
  withContext(context: Record<string, unknown>) {
    Object.assign(this.context, context);
    return this;
  }
  log(record: Record<string, unknown>, level: "debug" | "info" | "warn" | "error" = "info") {
    const out = serializeLog({
      time: new Date(),
      level,
      ...record,
    });

    switch (level) {
      case "debug":
        console.debug(out);
        break;
      case "info":
        console.log(out);
        break;
      case "warn":
        console.warn(out);
        break;
      case "error":
        console.error(out);
        break;
      default:
        exhaustiveMatchingGuard(level);
    }

    return this;
  }
  debug(record: Record<string, unknown>) {
    return this.log(record, "debug");
  }
  info(record: Record<string, unknown>) {
    return this.log(record, "info");
  }
  warn(record: Record<string, unknown>) {
    return this.log(record, "warn");
  }
  error(record: Record<string, unknown>) {
    return this.log(record, "error");
  }
}
