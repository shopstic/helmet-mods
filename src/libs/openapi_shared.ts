import { ResponseConfig, RouteConfig, z, ZodMediaTypeObject, ZodType } from "../deps/zod.ts";

export type Coalesce<T, D> = [T] extends [never] ? D : T;

export type ToStatusCode<T extends string | number> = T extends string
  ? T extends `${infer N extends number}` ? N : never
  : T extends number ? T
  : never;

export type OpenapiRouteConfig<P extends string = string> =
  & Pick<RouteConfig, "method" | "summary" | "tags" | "description" | "request">
  & {
    path: P;
    responses?: RouteConfig["responses"] | undefined;
  };

export type ExtractRequestParamsType<C extends OpenapiRouteConfig> = C extends {
  request: {
    params: infer P;
  };
} ? P extends ZodType<unknown> ? z.infer<P> : undefined
  : undefined;

export function extractRequestParamsSchema<C extends OpenapiRouteConfig>(config: C): ZodType<unknown> | undefined {
  return config.request?.params;
}

export type ExtractRequestQueryType<C extends OpenapiRouteConfig> = C extends {
  request: {
    query: infer Q;
  };
} ? Q extends ZodType<unknown> ? z.infer<Q> : undefined
  : undefined;

export function extractRequestQuerySchema<C extends OpenapiRouteConfig>(config: C): ZodType<unknown> | undefined {
  return config.request?.query;
}

export type ExtractRequestHeadersType<C extends OpenapiRouteConfig> = C extends {
  request: {
    headers: Array<infer H>;
  };
} ? H extends ZodType<unknown> ? z.infer<H> : undefined
  : undefined;

export function extractRequestHeadersSchema<C extends OpenapiRouteConfig>(config: C): ZodType<unknown> | undefined {
  const headers = config.request?.headers;

  if (Array.isArray(headers)) {
    return headers[0];
  }
}

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

type ExtractSchemaType<T> = T extends ZodType ? z.infer<T> : BodyInit | null;

type ExtractStatusContent<S extends number, T> = T extends {
  content: infer M;
} ? ExtractMediaTypes<S, M>
  : never;

type ExtractMediaTypes<S extends number, T, K extends Extract<keyof T, string> = Extract<keyof T, string>> = {
  [M in Extract<keyof T, string>]: T[M] extends {
    schema: infer Z;
  } ? TypedResponse<S, M, ExtractSchemaType<Z>>
    : never;
}[K];

type ExtractResponses<T, K extends Extract<keyof T, string | number> = Extract<keyof T, string | number>> = {
  [S in Extract<keyof T, string | number>]: ExtractStatusContent<ToStatusCode<S>, T[S]>;
}[K];

type ExtractResponseBodyType<T> = T extends {
  responses: infer R;
} ? ExtractResponses<R>
  : TypedResponse<number, string, unknown>;

type ExtractMediaTypesMap<T> = {
  [M in Extract<keyof T, string>]: T[M] extends {
    schema: infer Z;
  } ? ExtractSchemaType<Z>
    : never;
};

type ExtractStatusContentMap<T> = T extends {
  content: infer M;
} ? ExtractMediaTypesMap<M>
  : never;

type ExtractResponsesMap<T> = {
  [S in Extract<keyof T, string | number> as ToStatusCode<S>]: ExtractStatusContentMap<T[S]>;
};

type ExtractResponseBodyTypeMap<T> = T extends {
  responses: infer R;
} ? ExtractResponsesMap<R>
  : {
    200: {
      "text/plain": unknown;
    };
  };

type ResponseTypeMap = Map<number, Map<string, ZodMediaTypeObject["schema"]>>;

export function extractResponseTypeMap<C extends OpenapiRouteConfig>(config: C): ResponseTypeMap | undefined {
  if (config.responses) {
    const responses = Object.entries(config.responses).flatMap(([statusCode, response]) => {
      if (response.content) {
        return Object.entries(response.content).map(([mediaType, media]) => {
          return {
            statusCode: parseInt(statusCode),
            mediaType,
            schema: media.schema,
          };
        });
      }

      return [];
    });

    return responses.reduce(
      (map, { statusCode, mediaType, schema }) => {
        if (!map.has(statusCode)) {
          map.set(statusCode, new Map());
        }

        map.get(statusCode)!.set(mediaType, schema);
        return map;
      },
      new Map() as ResponseTypeMap,
    );
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

export type OpenapiJsonRouteConfig<P extends string = string> =
  & Pick<OpenapiRouteConfig, "method" | "summary" | "tags" | "description">
  & {
    path: P;
    request?: Omit<NonNullable<OpenapiRouteConfig["request"]>, "body"> & {
      body?: ZodType<unknown>;
    };
    response: Omit<ResponseConfig, "content"> & {
      body?: ZodType<unknown>;
    };
  };

export type OpenapiJsonRouteConfigToRouteConfig<P extends string, C extends OpenapiJsonRouteConfig<P>> =
  & Omit<C, "request" | "response">
  & {
    request: Omit<NonNullable<C["request"]>, "body"> & {
      body: NonNullable<C["request"]>["body"] extends undefined ? undefined
        : {
          content: {
            "application/json": {
              schema: NonNullable<NonNullable<C["request"]>["body"]>;
            };
          };
        };
    };
    responses: {
      200:
        & Omit<C["response"], "body">
        & (C["response"]["body"] extends undefined ? undefined : {
          content: {
            "application/json": {
              schema: NonNullable<C["response"]["body"]>;
            };
          };
        });
    };
  };

export function jsonRouteConfigToRouteConfig(config: OpenapiJsonRouteConfig): OpenapiRouteConfig {
  const { method, path, request, response: { body: responseBody, ...response } } = config;

  return {
    method,
    path,
    request: request
      ? {
        ...request,
        body: request.body
          ? {
            content: {
              "application/json": {
                schema: request.body,
              },
            },
          }
          : undefined,
      }
      : undefined,
    responses: responseBody
      ? {
        200: {
          ...response,
          content: {
            "application/json": {
              schema: responseBody,
            },
          },
        },
      }
      : undefined,
  };
}

export interface OpenapiEndpoint {
  config: OpenapiRouteConfig<string>;
  request: {
    query?: ZodType<unknown>;
    params?: ZodType<unknown>;
    headers?: ZodType<unknown>;
    body?: ZodType<unknown>;
  };
  response: {
    body?: ResponseTypeMap;
  };
}

export class OpenapiEndpoints<R> {
  private endpointByPathByMethodMap: Map<string, Map<string, OpenapiEndpoint>>;

  constructor() {
    this.endpointByPathByMethodMap = new Map();
  }

  get(path: string, method: string): OpenapiEndpoint | undefined {
    if (this.endpointByPathByMethodMap.has(path)) {
      return this.endpointByPathByMethodMap.get(path)!.get(method);
    }
  }

  jsonEndpoint<P extends string, J extends OpenapiJsonRouteConfig<P>>(
    jsonConfig: J,
  ) {
    const config = jsonRouteConfigToRouteConfig(jsonConfig) as OpenapiJsonRouteConfigToRouteConfig<P, J>;
    return this.endpoint(config);
  }

  endpoint<P extends string, C extends OpenapiRouteConfig<P>>(
    config: C,
  ): OpenapiEndpoints<
    & R
    & {
      [m in C["method"]]: {
        [p in C["path"]]: {
          request: {
            params: ExtractRequestParamsType<C>;
            query: ExtractRequestQueryType<C>;
            headers: ExtractRequestHeadersType<C>;
            body: ExtractRequestBodyType<C>;
          };
          response: {
            body: ExtractResponseBodyType<C>;
            bodyMap: ExtractResponseBodyTypeMap<C>;
          };
        };
      };
    }
  > {
    const endpoint: OpenapiEndpoint = {
      config,
      request: {
        query: extractRequestQuerySchema(config),
        params: extractRequestParamsSchema(config),
        headers: extractRequestHeadersSchema(config),
        body: extractRequestBodySchema(config),
      },
      response: {
        body: extractResponseTypeMap(config),
      },
    };

    if (!this.endpointByPathByMethodMap.has(config.path)) {
      this.endpointByPathByMethodMap.set(config.path, new Map());
    }

    this.endpointByPathByMethodMap.get(config.path)!.set(config.method, endpoint);

    return this;
  }
}

export type ExtractEndpointPaths<M extends RouteConfig["method"], E> = M extends keyof E ? E[M] : never;

export interface TypedResponse<S extends number, M extends string, D> {
  readonly status: S;
  readonly mediaType: M;
  readonly data: D;
}
