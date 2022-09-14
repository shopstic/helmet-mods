import { z } from "../deps/zod.ts";

function exhaustiveMatchingGuard(_: never): never {
  throw new Error("Non exhaustive matching");
}

export const promQueryErrorResponseSchema = z.object({
  status: z.literal("error"),
  errorType: z.string(),
  error: z.string(),
});

export const promQuerySuccessResponseSchema = z.object({
  status: z.literal("success"),
  data: z.object({
    resultType: z.literal("vector"),
    result: z.any(),
  }),
});

export const promLabelValuesSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    data: z.array(z.string()),
  }),
  promQueryErrorResponseSchema,
]);

export const promQueryResponseSchema = z.discriminatedUnion("status", [
  promQueryErrorResponseSchema,
  promQuerySuccessResponseSchema,
]);

export const promVectorSchema = z.object({
  metric: z.record(z.string()),
  value: z.tuple([z.number(), z.string()]),
});

export const promMatrixSchema = z.object({
  metric: z.record(z.string()),
  values: z.array(z.tuple([z.number(), z.string()])),
});

export type PromVector = z.infer<typeof promVectorSchema>;
export type PromMatrix = z.infer<typeof promMatrixSchema>;

export const promQueryVectorResponseSchema = z.discriminatedUnion("status", [
  promQueryErrorResponseSchema,
  z.object({
    status: z.literal("success"),
    data: z.object({
      resultType: z.literal("vector"),
      result: z.array(promVectorSchema),
    }),
  }),
]);

export const promQueryMatrixResponseSchema = z.discriminatedUnion("status", [
  promQueryErrorResponseSchema,
  z.object({
    status: z.literal("success"),
    data: z.object({
      resultType: z.literal("matrix"),
      result: z.array(promMatrixSchema),
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

async function promFetch<O, D, I>(
  schema: z.ZodType<O, D, I>,
  url: string,
  init: RequestInit = {},
): Promise<O> {
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
