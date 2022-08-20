import { deferred, delay } from "../deps/async_utils.ts";
import { Observable } from "../deps/rxjs.ts";
import { Type } from "../deps/typebox.ts";

export function commandWithTimeout(command: string[], timeoutSeconds: number): string[] {
  return ["timeout", "-k", "0", `${timeoutSeconds}s`, ...command];
}

export const NonEmptyString = Type.String({ minLength: 1 });

export function withAbortSignal<T>(fn: (signal: AbortSignal) => Observable<T>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const abortController = new AbortController();

    const subscription = fn(abortController.signal).subscribe(subscriber);

    return () => {
      abortController.abort();
      subscription.unsubscribe();
    };
  });
}

export function exhaustiveMatchingGuard(_: never): never {
  throw new Error("Non exhaustive matching");
}

export interface ReconciliationLoop<T = void> {
  request: (value: T) => void;
  loop: AsyncGenerator<T>;
}

export function createReconciliationLoop<T = void>(): ReconciliationLoop<T> {
  let promise = deferred<T>();

  async function* generator() {
    while (true) {
      const next = await promise;
      promise = deferred<T>();
      yield next;
    }
  }

  return {
    request(value: T) {
      promise.resolve(value);
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
    yield item;
    const now = performance.now();
    const elapseMs = now - last;

    const toDelayMs = Math.max(minDelayMs - elapseMs, 0);
    if (toDelayMs > 0) {
      await delay(toDelayMs);
    }
    last = performance.now();
  }
}
