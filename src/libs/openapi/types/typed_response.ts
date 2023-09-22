import { z, ZodType } from "../../../deps/zod.ts";
import { GenericHeaders, Simplify, ToStatusCode, TypedResponse } from "./shared.ts";

type ExtractBodySchemaType<T> = T extends ZodType ? z.infer<T> : BodyInit | null;
type ExtractHeaderSchemaType<T> = T extends ZodType ? z.infer<T> : unknown;

type FromHeaders<T> = {
  [M in Extract<keyof T, string>]: T[M] extends {
    schema: infer Z;
  } ? ExtractHeaderSchemaType<Z>
    : never;
};

type FromStatus<S extends number, T> = T extends {
  content: infer M;
} ? (
    T extends {
      headers: infer H;
    } ? FromMediaMap<S, M, FromHeaders<H>>
      : FromMediaMap<S, M, GenericHeaders>
  )
  : never;

type FromMediaMap<
  S extends number,
  T,
  H,
  K extends Extract<keyof T, string> = Extract<keyof T, string>,
> = {
  [M in Extract<keyof T, string>]: T[M] extends {
    schema: infer Z;
  } ? TypedResponse<S, M, ExtractBodySchemaType<Z>, Simplify<H>>
    : never;
}[K];

type FromResponses<
  T,
  K extends Extract<keyof T, string | number> = Extract<keyof T, string | number>,
> = {
  [S in Extract<keyof T, string | number>]: FromStatus<ToStatusCode<S>, T[S]>;
}[K];

export type TypedResponseUnion<T> = T extends {
  responses: infer R;
} ? FromResponses<R>
  : TypedResponse<number, string, unknown, GenericHeaders>;
