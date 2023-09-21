import { z, ZodType } from "../../../deps/zod.ts";
import { ToStatusCode, TypedResponse } from "./shared.ts";

type ExtractSchemaType<T> = T extends ZodType ? z.infer<T> : BodyInit | null;

type FromStatusContent<S extends number, T> = T extends {
  content: infer M;
} ? FromMediaMap<S, M>
  : never;

type FromMediaMap<
  S extends number,
  T,
  K extends Extract<keyof T, string> = Extract<keyof T, string>,
> = {
  [M in Extract<keyof T, string>]: T[M] extends {
    schema: infer Z;
  } ? TypedResponse<S, M, ExtractSchemaType<Z>>
    : never;
}[K];

type FromResponses<
  T,
  K extends Extract<keyof T, string | number> = Extract<keyof T, string | number>,
> = {
  [S in Extract<keyof T, string | number>]: FromStatusContent<ToStatusCode<S>, T[S]>;
}[K];

export type TypedResponseUnion<T> = T extends {
  responses: infer R;
} ? FromResponses<R>
  : TypedResponse<number, string, unknown>;
