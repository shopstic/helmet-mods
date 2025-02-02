import { Observable } from "$deps/rxjs.ts";

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
