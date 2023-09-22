import { z, ZodType } from "../../../deps/zod.ts";
import { OpenapiRouteConfig } from "./shared.ts";

export type ExtractRequestParamsType<C extends OpenapiRouteConfig> = C extends {
  request: {
    params: infer P;
  };
} ? P extends ZodType<unknown> ? z.infer<P> : undefined
  : undefined;

export type ExtractRequestQueryType<C extends OpenapiRouteConfig> = C extends {
  request: {
    query: infer Q;
  };
} ? Q extends ZodType<unknown> ? z.infer<Q> : undefined
  : undefined;

export type ExtractRequestHeadersType<C extends OpenapiRouteConfig> = C extends {
  request: {
    headers: infer H;
  };
} ? H extends ZodType<unknown> ? z.infer<H> : undefined
  : undefined;

export type ExtractRequestBodyType<C extends OpenapiRouteConfig> = C extends {
  request: {
    body: {
      content: {
        "application/json": {
          schema: infer B;
        };
      };
    };
  };
} ? B extends ZodType<unknown> ? z.infer<B> : undefined
  : undefined;
