import { Arr, Bool, NonEmpStr, Num, Obj, Opt, Rec, Str, Uni, Unk } from "$deps/schema.ts";

export const OpenapiMergerParamsSchema = {
  configFile: NonEmpStr(),
  staticRoot: NonEmpStr(),
  docsPath: NonEmpStr(),
  serverInterface: NonEmpStr(),
  serverPort: Num({ minimum: 0, maximum: 65535 }),
};

const OpenapiMergerParamsSchemaObj = Obj(OpenapiMergerParamsSchema);
export type OpenapiMergerParams = typeof OpenapiMergerParamsSchemaObj.infer;

export const OpenapiMergerConfigSchema = Obj({
  overrides: Opt(Rec(Str(), Unk())),
  stripAllOperationSecurity: Opt(Bool()),
  sources: Arr(Obj({
    url: Str(),
    merge: Opt(Obj({
      dispute: Opt(Uni([
        Obj({
          alwaysApply: Bool(),
          prefix: Str(),
        }),
        Obj({
          alwaysApply: Bool(),
          suffix: Str(),
        }),
      ])),
      pathModification: Opt(Obj({
        stripStart: Str(),
        prepend: Str(),
      })),
      operationSelection: Opt(Obj({
        includeTags: Opt(Arr(Str())),
        excludeTags: Opt(Arr(Str())),
      })),
      description: Opt(Obj({
        append: Bool(),
        title: Opt(Obj({
          value: Str(),
          headingLevel: Num(),
        })),
      })),
    })),
  })),
});

export type OpenapiMergerConfig = typeof OpenapiMergerConfigSchema.infer;
