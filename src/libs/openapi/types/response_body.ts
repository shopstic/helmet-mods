import { z, ZodType } from "../../../deps/zod.ts";
import { ToStatusCode } from "./shared.ts";

type ExtractSchemaType<T> = T extends ZodType ? z.infer<T> : BodyInit | null;

type FromMediaTypeMap<T> = {
  [M in Extract<keyof T, string>]: T[M] extends {
    schema: infer Z;
  } ? ExtractSchemaType<Z>
    : never;
};

type FromStatusContentMap<T> = T extends {
  content: infer M;
} ? FromMediaTypeMap<M>
  : never;

type FromResponses<T> = {
  [S in Extract<keyof T, string | number> as ToStatusCode<S>]: FromStatusContentMap<T[S]>;
};

export type ResponseBodyByStatusAndMediaMap<T> = T extends {
  responses: infer R;
} ? FromResponses<R>
  : {
    200: {
      "text/plain": unknown;
    };
  };
