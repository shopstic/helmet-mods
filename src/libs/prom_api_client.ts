import {
  type AnySchema,
  Arr,
  createValidator,
  Lit,
  Num,
  Obj,
  Rec,
  Str,
  Tup,
  type TypedSchema,
  Uni,
  Unk,
  type ValidationResult,
} from "$deps/schema.ts";

function exhaustiveMatchingGuard(_: never): never {
  throw new Error("Non exhaustive matching");
}

export const promQueryErrorResponseSchema = Obj({
  status: Lit("error"),
  errorType: Str(),
  error: Str(),
});

export const promQuerySuccessResponseSchema = Obj({
  status: Lit("success"),
  data: Obj({
    resultType: Lit("vector"),
    result: Unk(),
  }),
});

export const promLabelValuesSchema = Uni([
  Obj({
    status: Lit("success"),
    data: Arr(Str()),
  }),
  promQueryErrorResponseSchema,
]);

export const promQueryResponseSchema = Uni([
  promQueryErrorResponseSchema,
  promQuerySuccessResponseSchema,
]);

export const promVectorSchema = Obj({
  metric: Rec(Str(), Str()),
  value: Tup([Num(), Str()]),
});

export const promMatrixSchema = Obj({
  metric: Rec(Str(), Str()),
  values: Arr(Tup([Num(), Str()])),
});

export type PromVector = typeof promVectorSchema.infer;
export type PromMatrix = typeof promMatrixSchema.infer;

export const promQueryVectorResponseSchema = Uni([
  promQueryErrorResponseSchema,
  Obj({
    status: Lit("success"),
    data: Obj({
      resultType: Lit("vector"),
      result: Arr(promVectorSchema),
    }),
  }),
]);

export const promQueryMatrixResponseSchema = Uni([
  promQueryErrorResponseSchema,
  Obj({
    status: Lit("success"),
    data: Obj({
      resultType: Lit("matrix"),
      result: Arr(promMatrixSchema),
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

const schemaValidatorCache = new WeakMap<AnySchema, (value: unknown) => ValidationResult<unknown>>();
function getSchemaValidator<T>(schema: TypedSchema<T, unknown>): (value: unknown) => ValidationResult<T> {
  if (!schemaValidatorCache.has(schema)) {
    schemaValidatorCache.set(schema, createValidator(schema));
  }
  return schemaValidatorCache.get(schema)! as (value: unknown) => ValidationResult<T>;
}

async function promFetch<T>(
  schema: TypedSchema<T, unknown>,
  url: string,
  init: RequestInit = {},
): Promise<T> {
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
    const result = getSchemaValidator(schema)(json);

    if (!result.isSuccess) {
      throw new Error(`Failed to parse response: ${JSON.stringify(result.errors.First(), null, 2)}`);
    }

    return result.value;
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
