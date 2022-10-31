import { Static, Type } from "../../../deps/typebox.ts";
import { z } from "../../../deps/zod.ts";
import { NonEmptyString } from "../../../libs/utils.ts";

export const OpenapiMergerParamsSchema = Type.Object({
  configFile: NonEmptyString,
  staticRoot: NonEmptyString,
  docsPath: NonEmptyString,
  serverInterface: NonEmptyString,
  serverPort: Type.Number({ minimum: 0, maximum: 65535 }),
});

export type OpenapiMergerParams = Static<typeof OpenapiMergerParamsSchema>;

export const OpenapiMergerConfigSchema = z.object({
  overrides: z.record(z.string(), z.unknown()).optional(),
  sources: z.array(z.object({
    url: z.string(),
    merge: z.optional(z.object({
      dispute: z.optional(z.union([
        z.object({
          alwaysApply: z.boolean().optional(),
          prefix: z.string(),
        }),
        z.object({
          alwaysApply: z.boolean().optional(),
          suffix: z.string(),
        }),
      ])),
      pathModification: z.optional(z.object({
        stripStart: z.string().optional(),
        prepend: z.string().optional(),
      })),
      operationSelection: z.optional(z.object({
        includeTags: z.optional(z.array(z.string())),
        excludeTags: z.optional(z.array(z.string())),
      })),
      description: z.optional(z.object({
        append: z.boolean(),
        title: z.optional(z.object({
          value: z.string(),
          headingLevel: z.number().optional(),
        })),
      })),
    })),
  })),
});

export type OpenapiMergerConfig = z.infer<typeof OpenapiMergerConfigSchema>;
