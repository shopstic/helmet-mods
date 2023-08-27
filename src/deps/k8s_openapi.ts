export * from "https://deno.land/x/k8s@1.27.5/index.ts";
export type {
  OpenapiClient,
  OpenapiOperationApi,
  OpenapiOperationApiArgType,
  OpenapiOperationApiReturnType,
} from "https://deno.land/x/k8s@1.27.5/deps.ts";
export {
  createOpenapiClient,
  OpenapiOperationError,
  readerFromStreamReader,
  readLines,
} from "https://deno.land/x/k8s@1.27.5/deps.ts";
