import { OpenAPIRegistry, z } from "../../src/deps/zod.ts";
import { OpenapiEndpoints } from "../../src/libs/openapi/openapi_endpoint.ts";
import { OpenapiRouter } from "../../src/libs/openapi/openapi_server.ts";

export const registry = new OpenAPIRegistry();
export const endpoints = new OpenapiEndpoints()
  .endpoint({
    method: "get",
    path: "/alivez",
    summary: "Liveness check",
    responses: {
      200: {
        description: "OK",
        content: {
          "text/plain": {
            schema: z.literal("OK"),
          },
          "application/json": {
            schema: z.object({
              isOk: z.boolean(),
            }),
          },
        },
      },
    },
  });

const router = new OpenapiRouter({ registry, endpoints })
  .get("/alivez", ({ connInfo }, respond) => {
    console.log("connInfo", connInfo);

    return respond(200, "text/plain", "OK");
  });
