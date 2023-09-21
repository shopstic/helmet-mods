import { z, ZodType } from "../../../deps/zod.ts";
import { ToStatusCode } from "./shared.ts";

type ExtractSchemaType<T> = T extends ZodType ? z.infer<T> : BodyInit | null;

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

export type ResponseBodyByStatusAndMediaMap<T> = T extends {
  responses: infer R;
} ? ExtractResponsesMap<R>
  : {
    200: {
      "text/plain": unknown;
    };
  };
