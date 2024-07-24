export * from "@wok/utils/async";

export type Deferred<T> = PromiseWithResolvers<T> & {
  state: "pending" | "resolved" | "rejected";
};

export function deferred<T>(): Deferred<T> {
  let _state: Deferred<T>["state"] = "pending";

  const { promise, resolve, reject } = Promise.withResolvers<T>();

  return {
    promise,
    get state() {
      return _state;
    },
    resolve(v: Parameters<Deferred<T>["resolve"]>[0]) {
      _state = "resolved";
      resolve(v);
    },
    reject(e: Parameters<Deferred<T>["reject"]>[0]) {
      _state = "rejected";
      reject(e);
    },
  };
}
