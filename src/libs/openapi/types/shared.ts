import { RouteConfig } from "../../../deps/zod.ts";

export type ToStatusCode<T extends string | number> = T extends string
  ? T extends `${infer N extends number}` ? N : never
  : T extends number ? T
  : never;

export interface TypedResponse<S extends number, M extends string, D, H> {
  readonly status: S;
  readonly mediaType: M;
  readonly data: D;
  readonly headers: H;
}

export type Coalesce<T, D> = [T] extends [never] ? D : T;

export type OpenapiRouteConfig<P extends string = string> =
  & Pick<RouteConfig, "method" | "summary" | "tags" | "description" | "request">
  & {
    path: P;
    responses?: RouteConfig["responses"] | undefined;
  };

export type ExtractEndpointPaths<M extends RouteConfig["method"], E> = M extends keyof E ? E[M] : never;

export type ExcludeUndefinedValue<O> = {
  [K in keyof O as (O[K] extends undefined ? never : K)]: O[K];
};

export type StripEmptyObjectType<T> = keyof T extends never ? Record<never, never> : T;

// deno-lint-ignore ban-types
export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};

export type GenericHeaders = HeadersInit;
