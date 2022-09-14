export * from "https://deno.land/x/utils@2.8.0/k8s_utils.ts";
import { K8sCrdSchema } from "https://deno.land/x/utils@2.8.0/k8s_utils.ts";
import { Static } from "./typebox.ts";

export type K8sCrd = Static<typeof K8sCrdSchema>;
