const abortController = new AbortController();
const signal = new Proxy(abortController.signal, {
  get(target, prop, receiver) {
    console.log("Proxy", prop);
    return Reflect.get(target, prop, receiver);
  },
});

const oldFetch = globalThis.fetch;
globalThis.fetch = async (
  input: URL | Request | string,
  init?: RequestInit,
) => {
  const signal = init?.signal;

  if (signal && !signal.aborted) {
    const abortController = new AbortController();
    const onAbort = (event: Event) => {
      abortController.abort(event);
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

for (let i = 0; i < 10; i++) {
  console.log("Call", i);
  await (await fetch("https://google.com", { signal })).text();
}
