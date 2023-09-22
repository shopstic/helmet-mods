import { z, ZodType } from "../../../deps/zod.ts";
import { ToStatusCode } from "./shared.ts";

type ExtractSchemaType<T> = T extends ZodType ? z.infer<T> : unknown;

type FromHeaders<T> = {
  [M in Extract<keyof T, string>]: T[M] extends {
    schema: infer Z;
  } ? ExtractSchemaType<Z>
    : never;
};

type FromStatus<T> = T extends {
  headers: infer H;
} ? FromHeaders<H>
  : never;

type FromResponses<T> = {
  [S in Extract<keyof T, string | number> as ToStatusCode<S>]: FromStatus<T[S]>;
};

export type ResponseHeaderMapByStatusMap<T> = T extends {
  responses: infer R;
} ? FromResponses<R>
  : never;
