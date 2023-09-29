import { Static, TSchema, Type } from "../deps/typebox.ts";

function exhaustiveMatchingGuard(_: never): never {
  throw new Error("Non exhaustive matching");
}

export const promQueryErrorResponseSchema = Type.Object({
  status: Type.Literal("error"),
  errorType: Type.String(),
  error: Type.String(),
});

export const promQuerySuccessResponseSchema = Type.Object({
  status: Type.Literal("success"),
  data: Type.Object({
    resultType: Type.Literal("vector"),
    result: Type.Any(),
  }),
});

export const promLabelValuesSchema = Type.Union([
  Type.Object({
    status: Type.Literal("success"),
    data: Type.Array(Type.String()),
  }),
  promQueryErrorResponseSchema,
]);

export const promQueryResponseSchema = Type.Union([
  promQueryErrorResponseSchema,
  promQuerySuccessResponseSchema,
]);

export const promVectorSchema = Type.Object({
  metric: Type.Record(Type.String(), Type.String()),
  value: Type.Tuple([Type.Number(), Type.String()]),
});

export const promMatrixSchema = Type.Object({
  metric: Type.Record(Type.String(), Type.String()),
  values: Type.Array(Type.Tuple([Type.Number(), Type.String()])),
});

export type PromVector = Static<typeof promVectorSchema>;
export type PromMatrix = Static<typeof promMatrixSchema>;

export const promQueryVectorResponseSchema = Type.Union([
  promQueryErrorResponseSchema,
  Type.Object({
    status: Type.Literal("success"),
    data: Type.Object({
      resultType: Type.Literal("vector"),
      result: Type.Array(promVectorSchema),
    }),
  }),
]);

export const promQueryMatrixResponseSchema = Type.Union([
  promQueryErrorResponseSchema,
  Type.Object({
    status: Type.Literal("success"),
    data: Type.Object({
      resultType: Type.Literal("matrix"),
      result: Type.Array(promMatrixSchema),
    }),
  }),
]);

export class PromQueryError extends Error {
  errorType: string;
  constructor(message: string, errorType: string) {
    super(message);
    this.errorType = errorType;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PromApiError extends Error {
  readonly headers: Headers;
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly data: unknown;

  constructor(response: { headers: Headers; url: string; status: number; statusText: string; data: unknown }) {
    super(response.statusText);
    Object.setPrototypeOf(this, new.target.prototype);

    this.headers = response.headers;
    this.url = response.url;
    this.status = response.status;
    this.statusText = response.statusText;
    this.data = response.data;
  }
}

async function promFetch<T extends TSchema>(
  schema: T,
  url: string,
  init: RequestInit = {},
): Promise<Static<T>> {
  const response = await fetch(
    url,
    {
      ...init,
      headers: {
        ...init.headers,
        Accept: "application/json",
      },
    },
  );

  if (response.ok) {
    const json = await response.json();

    const validated = schema.safeParse(json);

    if (validated.success) {
      return validated.data;
    }

    throw validated.error;
  } else {
    throw new PromApiError({
      ...response,
      data: await response.text(),
    });
  }
}

export function createPromApiClient(baseUrl: string) {
  return {
    async vectorQuery({ query, time }: { query: string; time?: Date }, init?: RequestInit): Promise<PromVector[]> {
      const params = {
        query,
        ...(typeof time !== "undefined"
          ? {
            time: String(time.getTime() / 1000),
          }
          : {}),
      };

      const result = await promFetch(
        promQueryVectorResponseSchema,
        `${baseUrl}/query?${new URLSearchParams(params)}`,
        init,
      );

      if (result.status === "success") {
        return result.data.result;
      }

      if (result.status === "error") {
        throw new PromQueryError(result.error, result.errorType);
      }

      return exhaustiveMatchingGuard(result);
    },
    async matrixQuery({ query, time }: { query: string; time: Date }, init?: RequestInit): Promise<PromMatrix[]> {
      const params = {
        query,
        time: String(time.getTime() / 1000),
      };

      const result = await promFetch(
        promQueryMatrixResponseSchema,
        `${baseUrl}/query?${new URLSearchParams(params)}`,
        init,
      );

      if (result.status === "success") {
        return result.data.result;
      }

      if (result.status === "error") {
        throw new PromQueryError(result.error, result.errorType);
      }

      return exhaustiveMatchingGuard(result);
    },
    async rangeQuery({
      query,
      fromTime,
      toTime,
      stepSeconds,
    }: {
      query: string;
      fromTime: Date;
      toTime: Date;
      stepSeconds: number;
    }, init?: RequestInit): Promise<PromMatrix[]> {
      const params = {
        query,
        start: String(fromTime.getTime() / 1000),
        end: String(toTime.getTime() / 1000),
        step: String(stepSeconds),
      };

      const result = await promFetch(
        promQueryMatrixResponseSchema,
        `${baseUrl}/query_range?${new URLSearchParams(params)}`,
        init,
      );

      if (result.status === "success") {
        return result.data.result;
      }

      if (result.status === "error") {
        throw new PromQueryError(result.error, result.errorType);
      }

      return exhaustiveMatchingGuard(result);
    },
  };
}
