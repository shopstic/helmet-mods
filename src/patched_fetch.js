// https://github.com/denoland/deno/issues/16487
const oldFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const signal = init?.signal;
  if (signal && !signal.aborted) {
    const abortController = new AbortController();
    const onAbort = (event) => {
      abortController.abort(event.target && "reason" in event.target ? event.target.reason : undefined);
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
