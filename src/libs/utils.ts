import type { Deferred } from "$deps/async_utils.ts";
import { deferred, delay } from "$deps/async_utils.ts";

export function commandWithTimeout(command: string[], timeoutSeconds: number): string[] {
  return ["timeout", "-k", "0", `${timeoutSeconds}s`, ...command];
}
export function exhaustiveMatchingGuard(_: never): never {
  throw new Error("Non exhaustive matching");
}

export interface ReconciliationLoop<T = void> {
  request: (value: T) => void;
  loop: AsyncGenerator<T>;
}

export function createReconciliationLoop<T = void>(): ReconciliationLoop<T> {
  let promise: Deferred<void> = deferred();
  let lastValue: T = null as T;

  async function* generator() {
    while (true) {
      await promise.promise;
      promise = deferred();
      yield lastValue;
    }
  }

  return {
    request(value: T) {
      lastValue = value;
      promise.resolve();
    },
    loop: generator(),
  };
}

export async function* agInterval(intervalMs: number): AsyncGenerator<void> {
  let last = performance.now();

  while (true) {
    yield;
    const now = performance.now();
    const elapseMs = now - last;

    const toDelayMs = Math.max(intervalMs - elapseMs, 0);
    if (toDelayMs > 0) {
      await delay(toDelayMs);
    }
    last = performance.now();
  }
}

export async function* agThrottle<T>(items: AsyncGenerator<T>, minDelayMs: number): AsyncGenerator<T> {
  let last = performance.now();

  for await (const item of items) {
    const now = performance.now();
    const elapseMs = now - last;

    const toDelayMs = Math.max(minDelayMs - elapseMs, 0);
    if (toDelayMs > 0) {
      await delay(toDelayMs);
    }

    yield item;
    last = performance.now();
  }
}

export function stripMargin(template: TemplateStringsArray, ...expressions: unknown[]) {
  const result = template.reduce((accumulator, part, i) => {
    return accumulator + expressions[i - 1] + part;
  });

  return result.replace(/(\n|\r|\r\n)\s*\|/g, "$1");
}
