// https://github.com/denoland/deno/issues/16487
globalThis.fetch = (() => {
  const oldFetch = globalThis.fetch;
  return async (input, /* : URL | Request | string */ init /* ?: RequestInit */) => /* : Promise<Response> */ {
    const signal = init?.signal;
    if (signal && !signal.aborted) {
      const abortController = new AbortController();
      const onAbort = (event /* : Event */) => {
        const target = event.target;
        abortController.abort(target && "reason" in target ? target.reason : undefined);
      };
      signal.addEventListener("abort", onAbort);
      try {
        return await oldFetch(input, {
          ...init,
          signal: abortController.signal,
        });
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    }
    return await oldFetch(input, init);
  };
})();
