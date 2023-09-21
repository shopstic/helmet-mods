import { ZodMediaTypeObject } from "../../../deps/zod.ts";
import { OpenapiRouteConfig } from "../types/shared.ts";

export type ResponseSchemaMap = Map<number, Map<string, ZodMediaTypeObject["schema"]>>;

export function extractResponseSchemaMap<C extends OpenapiRouteConfig>(config: C): ResponseSchemaMap | undefined {
  if (config.responses) {
    const responses = Object.entries(config.responses).flatMap(([statusCode, response]) => {
      if (response.content) {
        return Object.entries(response.content).map(([mediaType, media]) => {
          return {
            statusCode: parseInt(statusCode),
            mediaType,
            schema: media.schema,
          };
        });
      }

      return [];
    });

    return responses.reduce(
      (map, { statusCode, mediaType, schema }) => {
        if (!map.has(statusCode)) {
          map.set(statusCode, new Map());
        }

        map.get(statusCode)!.set(mediaType, schema);
        return map;
      },
      new Map() as ResponseSchemaMap,
    );
  }
}
