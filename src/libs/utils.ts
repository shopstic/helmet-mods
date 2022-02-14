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
