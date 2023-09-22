import { ZodType } from "../../../deps/zod.ts";
import { OpenapiRouteConfig } from "../types/shared.ts";

export function extractRequestParamsSchema<C extends OpenapiRouteConfig>(config: C): ZodType<unknown> | undefined {
  return config.request?.params;
}

export function extractRequestQuerySchema<C extends OpenapiRouteConfig>(config: C): ZodType<unknown> | undefined {
  return config.request?.query;
}

export function extractRequestHeadersSchema<C extends OpenapiRouteConfig>(config: C): ZodType<unknown> | undefined {
  const headers = config.request?.headers;

  if (Array.isArray(headers)) {
    return headers[0];
  }
}

export function extractRequestBodySchema<C extends OpenapiRouteConfig>(config: C): ZodType<unknown> | undefined {
  const bodyContent = config.request?.body?.content;

  if (bodyContent) {
    const schema = bodyContent["application/json"]?.schema;

    if (schema instanceof ZodType) {
      return schema;
    }
  }
}
