import { RouteConfig, ZodError } from "../../deps/zod.ts";
import { OpenapiEndpoint, OpenapiEndpoints, OpenapiEndpointTypeBag } from "./openapi_endpoint.ts";
import { ExcludeUndefinedValue, ExtractEndpointPaths, StripEmptyObjectType, TypedResponse } from "./types/shared.ts";

interface OpenapiClientRequestContext<P, Q, H, B> {
  params: P;
  query: Q;
  headers: H;
  body: B;
}

export class ClientResponse<S extends number = number, M extends string = string, D = unknown, H = unknown>
  implements TypedResponse<S, M, D, H> {
  readonly ok: boolean;

  constructor(
    readonly status: S,
    readonly mediaType: M,
    readonly data: D,
    readonly response: Response,
    readonly headers: H,
  ) {
    this.ok = response.ok;
  }
}

export class OpenapiClientUnexpectedResponseError extends Error {
  readonly name = OpenapiClientUnexpectedResponseError.name;
  constructor(readonly body: unknown, readonly response: Response) {
    super(`Received an unexpected response with status=${response.status} ${response.statusText}`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class OpenapiClientResponseHeaderValidationError extends Error {
  readonly name = OpenapiClientResponseHeaderValidationError.name;
  constructor(readonly headerName: string, readonly headerValue: string | null, readonly error: ZodError<unknown>) {
    super(`Header with name '${headerName}' and value '${headerValue}' failed schema validation`);
    Object.setPrototypeOf(this, new.target.prototype);
    Object.defineProperty(this, "message", {
      get() {
        return JSON.stringify(error.errors);
      },
      enumerable: false,
      configurable: false,
    });
  }
}

export class OpenapiClientResponseValidationError extends Error {
  readonly name = OpenapiClientResponseValidationError.name;
  constructor(readonly response: Response, readonly data: string, readonly error: ZodError<unknown>) {
    super(response.statusText);
    Object.setPrototypeOf(this, new.target.prototype);
    Object.defineProperty(this, "message", {
      get() {
        return JSON.stringify(error.errors);
      },
      enumerable: false,
      configurable: false,
    });
  }
}

type ExtractClientRequestArg<Bag> = Bag extends
  OpenapiEndpointTypeBag<infer P, infer Q, infer H, infer B, unknown, unknown, unknown>
  ? StripEmptyObjectType<ExcludeUndefinedValue<OpenapiClientRequestContext<P, Q, H, B>>>
  : undefined;

type ExtractClientResponseArg<Bag> = Bag extends
  OpenapiEndpointTypeBag<unknown, unknown, unknown, unknown, infer R, unknown, unknown>
  ? TypedResponseToClientResponse<R>
  : ClientResponse<number, string, unknown, HeadersInit>;

type TypedResponseToClientResponse<R> = R extends TypedResponse<infer S, infer M, infer D, infer H>
  ? ClientResponse<S, M, D, H>
  : never;

function renderPath(template: string, params?: Record<string, string>) {
  if (params) {
    return template.replace(/\{([^}]+)\}/g, (_, key) => {
      if (!(key in params)) {
        throw new Error(
          `Expected path key ${key} doesnt exist in payload: ${JSON.stringify(params)}`,
        );
      }
      return encodeURIComponent(params[key]);
    });
  }

  return template;
}

async function openapiFetch({ baseUrl, pathTemplate, method, request, endpoint }: {
  baseUrl: string;
  pathTemplate: string;
  method: RouteConfig["method"];
  // deno-lint-ignore no-explicit-any
  request?: OpenapiClientRequestContext<any, any, any, any>;
  endpoint: OpenapiEndpoint;
}): Promise<ClientResponse> {
  const params = request?.params;
  const query = request?.query;
  const path = params ? renderPath(pathTemplate, params) : pathTemplate;
  const url = new URL(`${baseUrl}${path}${query !== undefined ? `?${new URLSearchParams(request?.query)}` : ""}`);
  const headers = new Headers(request?.headers);

  if (request?.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const responseBodyMap = endpoint.response.body;

  if (responseBodyMap !== undefined) {
    const acceptMediaTypes = Array.from(
      new Set(Array.from(responseBodyMap.values()).flatMap((m) => Array.from(m.keys()))),
    );
    headers.set("accept", acceptMediaTypes.join(", "));
  }

  const response = await fetch(url, {
    method: method.toUpperCase(),
    headers,
    body: request?.body !== undefined ? JSON.stringify(request?.body) : undefined,
  });

  const { status: responseStatus, headers: responseHeaders } = response;
  const responseContentType = response.headers.get("content-type");

  if (responseBodyMap === undefined) {
    return new ClientResponse(responseStatus, "", response.body, response, responseHeaders);
  }

  let responseBody;

  if (responseContentType === "application/json") {
    responseBody = await response.json();
  } else if (responseContentType?.startsWith("text/")) {
    responseBody = await response.text();
  } else {
    responseBody = response.body;
  }

  if (responseContentType === null) {
    throw new OpenapiClientUnexpectedResponseError(responseBody, response);
  }

  const schemas = responseBodyMap.get(responseStatus)?.get(responseContentType);

  if (schemas === undefined) {
    throw new OpenapiClientUnexpectedResponseError(responseBody, response);
  }

  const { body: bodySchema, headers: headerSchemaMap } = schemas;

  const validatedResponseHeaders = headerSchemaMap
    ? Object.fromEntries(
      Object.entries(headerSchemaMap).map(([headerName, headerSchema]) => {
        const headerValue = responseHeaders.get(headerName);
        const validation = headerSchema.safeParse(headerValue);

        if (validation.success) {
          return [headerName, validation.data];
        } else {
          throw new OpenapiClientResponseHeaderValidationError(headerName, headerValue, validation.error);
        }
      }),
    )
    : responseHeaders;

  if (bodySchema) {
    const validation = bodySchema.safeParse(responseBody);

    if (validation.success) {
      return new ClientResponse(
        responseStatus,
        responseContentType,
        validation.data,
        response,
        validatedResponseHeaders,
      );
    } else {
      throw new OpenapiClientResponseValidationError(response, responseBody, validation.error);
    }
  }

  return new ClientResponse(responseStatus, responseContentType, responseBody, response, responseHeaders);
}

export class OpenapiClient<R> {
  private endpoints: OpenapiEndpoints<R>;
  private baseUrl: string;

  constructor({ baseUrl, endpoints }: { baseUrl: string; endpoints: OpenapiEndpoints<R> }) {
    this.baseUrl = baseUrl;
    this.endpoints = endpoints;
  }

  endpoint<
    M extends RouteConfig["method"],
    P extends string,
    Req extends OpenapiClientRequestContext<unknown, unknown, unknown, unknown>,
  >(method: M, path: P, request?: Req) {
    const endpoint = this.endpoints.get(path, method);

    if (!endpoint) {
      throw new Error(`Defect: no endpoint found for path=${path} method=${method}`);
    }

    return openapiFetch({
      baseUrl: this.baseUrl,
      pathTemplate: path,
      method,
      request,
      endpoint,
    });
  }

  get<
    E extends ExtractEndpointPaths<"get", R>,
    P extends Extract<keyof E, string>,
    Req extends ExtractClientRequestArg<E[P]>,
    Res extends ExtractClientResponseArg<E[P]>,
  >(path: P, request: Req) {
    return this.endpoint("get", path, request) as Promise<Res>;
  }

  post<
    E extends ExtractEndpointPaths<"post", R>,
    P extends Extract<keyof E, string>,
    Req extends ExtractClientRequestArg<E[P]>,
    Res extends ExtractClientResponseArg<E[P]>,
  >(path: P, request: Req) {
    return this.endpoint("post", path, request) as Promise<Res>;
  }

  put<
    E extends ExtractEndpointPaths<"put", R>,
    P extends Extract<keyof E, string>,
    Req extends ExtractClientRequestArg<E[P]>,
    Res extends ExtractClientResponseArg<E[P]>,
  >(path: P, request: Req) {
    return this.endpoint("put", path, request) as Promise<Res>;
  }

  patch<
    E extends ExtractEndpointPaths<"patch", R>,
    P extends Extract<keyof E, string>,
    Req extends ExtractClientRequestArg<E[P]>,
    Res extends ExtractClientResponseArg<E[P]>,
  >(path: P, request: Req) {
    return this.endpoint("patch", path, request) as Promise<Res>;
  }

  delete<
    E extends ExtractEndpointPaths<"delete", R>,
    P extends Extract<keyof E, string>,
    Req extends ExtractClientRequestArg<E[P]>,
    Res extends ExtractClientResponseArg<E[P]>,
  >(path: P, request: Req) {
    return this.endpoint("delete", path, request) as Promise<Res>;
  }
}