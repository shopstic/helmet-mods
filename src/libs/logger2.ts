import { exhaustiveMatchingGuard } from "./utils.ts";

function serializeLog(event: unknown) {
  return JSON.stringify(event, (_, value) => {
    if (value instanceof Error) {
      // deno-lint-ignore no-explicit-any
      return Object.fromEntries(Object.getOwnPropertyNames(value).map((k) => [k, (value as any)[k]]));
    }
    return value;
  });
}

export class Logger {
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
      t: new Date(),
      l: level,
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
