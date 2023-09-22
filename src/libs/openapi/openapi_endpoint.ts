import { ResponseConfig, ZodType } from "../../deps/zod.ts";
import { extractRequestBodySchema, extractRequestParamsSchema, extractRequestQuerySchema } from "./runtime/request.ts";
import { extractResponseSchemaMap, ResponseSchemaMap } from "./runtime/response.ts";
import type {
  ExtractRequestBodyType,
  ExtractRequestHeadersType,
  ExtractRequestParamsType,
  ExtractRequestQueryType,
} from "./types/request.ts";
import { ResponseBodyByStatusAndMediaMap } from "./types/response_body.ts";
import { ResponseHeaderMapByStatusMap } from "./types/response_headers.ts";
import { OpenapiRouteConfig } from "./types/shared.ts";
import { TypedResponseUnion } from "./types/typed_response.ts";

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
    body?: ResponseSchemaMap;
  };
}

export type OpenapiEndpointTypeBag<
  QP = unknown,
  QQ = unknown,
  QH = unknown,
  QB = unknown,
  RT = unknown,
  RB = unknown,
  RH = unknown,
> = {
  request: {
    params: QP;
    query: QQ;
    headers: QH;
    body: QB;
  };
  response: {
    type: RT;
    bodyByStatusAndMediaMap: RB;
    headerMapByStatusMap: RH;
  };
};

export type OpenapiExtractEndpointTypeBag<E, M extends string, P extends string> = E extends OpenapiEndpoints<infer R>
  ? M extends keyof R ? (P extends keyof R[M] ? (R[M][P] extends OpenapiEndpointTypeBag ? R[M][P] : never) : never)
  : never
  : never;

export class OpenapiEndpoints<R> {
  static merge<A, B>(left: OpenapiEndpoints<A>, right: OpenapiEndpoints<B>): OpenapiEndpoints<A & B> {
    const leftMap = left.endpointByPathByMethodMap;
    const rightMap = right.endpointByPathByMethodMap;
    const mergedMap = new Map<string, Map<string, OpenapiEndpoint>>();

    for (const [path, methodMap] of leftMap) {
      if (!mergedMap.has(path)) {
        mergedMap.set(path, new Map());
      }

      for (const [method, endpoint] of methodMap) {
        mergedMap.get(path)!.set(method, endpoint);
      }
    }

    for (const [path, methodMap] of rightMap) {
      if (!mergedMap.has(path)) {
        mergedMap.set(path, new Map());
      }

      for (const [method, endpoint] of methodMap) {
        mergedMap.get(path)!.set(method, endpoint);
      }
    }

    return new OpenapiEndpoints(mergedMap);
  }

  merge<E>(other: OpenapiEndpoints<E>): OpenapiEndpoints<R & E> {
    return OpenapiEndpoints.merge(this, other);
  }

  constructor(public readonly endpointByPathByMethodMap: Map<string, Map<string, OpenapiEndpoint>> = new Map()) {
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
        [p in C["path"]]: OpenapiEndpointTypeBag<
          ExtractRequestParamsType<C>,
          ExtractRequestQueryType<C>,
          ExtractRequestHeadersType<C>,
          ExtractRequestBodyType<C>,
          TypedResponseUnion<C>,
          ResponseBodyByStatusAndMediaMap<C>,
          ResponseHeaderMapByStatusMap<C>
        >;
      };
    }
  > {
    const endpoint: OpenapiEndpoint = {
      config,
      request: {
        query: extractRequestQuerySchema(config),
        params: extractRequestParamsSchema(config),
        headers: extractRequestParamsSchema(config),
        body: extractRequestBodySchema(config),
      },
      response: {
        body: extractResponseSchemaMap(config),
      },
    };

    if (!this.endpointByPathByMethodMap.has(config.path)) {
      this.endpointByPathByMethodMap.set(config.path, new Map());
    }

    this.endpointByPathByMethodMap.get(config.path)!.set(config.method, endpoint);

    return this;
  }
}
