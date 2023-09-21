import { OpenAPIRegistry, z, ZodBoolean, ZodDate, ZodNumber } from "../../src/deps/zod.ts";
import { OpenapiEndpoints } from "../../src/libs/openapi/openapi_endpoint.ts";

export function zsNumber(updater: (s: ZodNumber) => ZodNumber = (s) => s) {
  return z.preprocess((arg) => {
    if (typeof arg === "number") {
      return arg;
    }

    if (typeof arg === "string") {
      return parseInt(arg, 10);
    }
  }, updater(z.number()));
}

export function zsBoolean(updater: (s: ZodBoolean) => ZodBoolean = (s) => s) {
  return z
    .preprocess((arg) => {
      if (typeof arg === "boolean") {
        return arg;
      }

      if (typeof arg === "string") {
        if (arg === "true") return true;
        if (arg === "false") return false;
      }
    }, updater(z.boolean()));
}

export function zsDate(updater: (s: ZodDate) => ZodDate = (s) => s) {
  return z
    .preprocess((arg) => {
      if (arg instanceof Date) {
        return arg;
      }
      if (typeof arg === "string") return new Date(arg);
    }, updater(z.date()));
}

export const registry = new OpenAPIRegistry();
export const UserSchema = registry.register(
  "User",
  z.object({
    id: zsNumber((s) => s.min(1).max(9999)).openapi({ example: 1212121 }),
    name: z.string().openapi({ example: "John Doe" }),
    age: z.number().min(1).max(200).openapi({ example: 42 }),
    gender: z.union([z.literal("male"), z.literal("female"), z.literal("unknown")]),
    weapon: z.discriminatedUnion("type", [
      z.object({ type: z.literal("a"), a: z.string() }),
      z.object({ type: z.literal("b"), b: z.string() }),
    ]),
  }),
);

export const InternalErrorSchema = registry.register(
  "InternalError",
  z.object({
    error: z.boolean(),
    message: z.string(),
  }),
);

export const NotFoundError = registry.register(
  "NotFoundError",
  z.object({
    error: z.boolean(),
    message: z.string(),
  }),
);

export const getHealthz = {
  method: "get",
  path: "/healthz",
  summary: "Health check",
};

export const endpoints = new OpenapiEndpoints()
  .jsonEndpoint({
    method: "get",
    path: "/users/{id}",
    summary: "Get a single user",
    request: {
      params: z.object({ id: zsNumber((s) => s.max(999)) }),
    },
    response: {
      description: "Object with user data.",
      body: UserSchema,
    },
  })
  .endpoint({
    method: "get",
    path: "/healthz",
    summary: "Health check",
  })
  .endpoint({
    method: "get",
    path: "/alivez",
    summary: "Liveness check",
    responses: {
      200: {
        description: "OK",
        content: {
          "text/plain": {
            schema: z.literal("OK"),
          },
          "application/json": {
            schema: z.object({
              isOk: z.boolean(),
            }),
          },
        },
      },
    },
  })
  .jsonEndpoint({
    method: "put",
    path: "/users/{id}",
    summary: "Update a single user",
    request: {
      params: z.object({ id: zsNumber() }),
      query: z.object({ dryRun: zsBoolean() }),
      headers: [
        z.object({
          "x-some-uuid": z.string().uuid().min(1),
          "x-some-date": zsDate().openapi({ type: "string", format: "date-time" }),
        }),
      ],
      body: UserSchema,
    },
    response: {
      description: "Object with user data.",
      body: UserSchema,
    },
  })
  .endpoint({
    method: "post",
    path: "/users/{id}",
    summary: "Update a single user",
    request: {
      params: z.object({ id: zsNumber() }),
      query: z.object({ dryRun: zsBoolean() }),
      headers: [
        z.object({
          "x-some-uuid": z.string().uuid().min(1),
          "x-some-date": zsDate().openapi({ type: "string", format: "date-time" }),
        }),
      ],
      body: {
        content: {
          "application/json": {
            schema: UserSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Object with user data.",
        content: {
          "application/json": {
            schema: UserSchema,
          },
        },
      },
      201: {
        description: "Object with user data.",
        content: {
          "application/json": {
            schema: UserSchema,
          },
        },
      },
      400: {
        description: "Access denied",
        content: {
          "text/plain": {
            schema: z.literal("Access denied"),
          },
        },
      },
      404: {
        description: "The user is not found",
        content: {
          "application/json": {
            schema: NotFoundError,
          },
        },
      },
    },
  })
  .endpoint({
    method: "get",
    path: "/download/{fileName}.pdf",
    summary: "Download a PDF file",
    request: {
      params: z.object({
        fileName: z.string().min(1),
      }),
    },
    responses: {
      200: {
        description: "The file",
        content: {
          "application/pdf": {
            schema: {
              type: "string",
              format: "binary",
            },
          },
        },
      },
    },
  });
