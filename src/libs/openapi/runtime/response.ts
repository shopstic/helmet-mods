import { ZodType } from "../../../deps/zod.ts";
import { OpenapiRouteConfig } from "../types/shared.ts";

export type ResponseSchemaMap = Map<
  number,
  Map<string, {
    body?: ZodType;
    headers?: Record<string, ZodType>;
  }>
>;

export function extractResponseSchemaMap<C extends OpenapiRouteConfig>(config: C): ResponseSchemaMap | undefined {
  if (config.responses) {
    const responses = Object.entries(config.responses).flatMap(([statusCode, response]) => {
      if (response.content) {
        let headerSchemaMap: Record<string, ZodType> | undefined = undefined;

        if (response.headers) {
          headerSchemaMap = {};
          for (const [headerName, { schema: headerSchema }] of Object.entries(response.headers)) {
            if (headerSchema instanceof ZodType) {
              headerSchemaMap[headerName] = headerSchema;
            }
          }
        }

        return Object.entries(response.content).map(([mediaType, media]) => {
          return {
            statusCode: parseInt(statusCode),
            mediaType,
            bodySchema: media.schema instanceof ZodType ? media.schema : undefined,
            headerSchemaMap,
          };
        });
      }

      return [];
    });

    return responses.reduce(
      (map, { statusCode, mediaType, bodySchema, headerSchemaMap }) => {
        if (!map.has(statusCode)) {
          map.set(statusCode, new Map());
        }

        map.get(statusCode)!.set(mediaType, {
          body: bodySchema,
          headers: headerSchemaMap,
        });
        return map;
      },
      new Map() as ResponseSchemaMap,
    );
  }
}
