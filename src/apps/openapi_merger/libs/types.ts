import type { Static } from "../../../deps/typebox.ts";
import { Type, TypeCompiler } from "../../../deps/typebox.ts";
import { NonEmptyString } from "../../../libs/utils.ts";

export const OpenapiMergerParamsSchema = Type.Object({
  configFile: NonEmptyString,
  staticRoot: NonEmptyString,
  docsPath: NonEmptyString,
  serverInterface: NonEmptyString,
  serverPort: Type.Number({ minimum: 0, maximum: 65535 }),
});

export type OpenapiMergerParams = Static<typeof OpenapiMergerParamsSchema>;

export const OpenapiMergerConfigSchema = Type.Object({
  overrides: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  stripAllOperationSecurity: Type.Optional(Type.Boolean()),
  sources: Type.Array(Type.Object({
    url: Type.String(),
    merge: Type.Optional(Type.Object({
      dispute: Type.Optional(Type.Union([
        Type.Object({
          alwaysApply: Type.Boolean(),
          prefix: Type.String(),
        }),
        Type.Object({
          alwaysApply: Type.Boolean(),
          suffix: Type.String(),
        }),
      ])),
      pathModification: Type.Optional(Type.Object({
        stripStart: Type.String(),
        prepend: Type.String(),
      })),
      operationSelection: Type.Optional(Type.Object({
        includeTags: Type.Optional(Type.Array(Type.String())),
        excludeTags: Type.Optional(Type.Array(Type.String())),
      })),
      description: Type.Optional(Type.Object({
        append: Type.Boolean(),
        title: Type.Optional(Type.Object({
          value: Type.String(),
          headingLevel: Type.Number(),
        })),
      })),
    })),
  })),
});

export const OpenapiMergerConfigCheck = TypeCompiler.Compile(OpenapiMergerConfigSchema);

export type OpenapiMergerConfig = Static<typeof OpenapiMergerConfigSchema>;
