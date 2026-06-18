import { zodToJsonSchema } from "zod-to-json-schema";
import type { OperationRegistry } from "./registry";

export interface OpenApiInfo {
    title: string;
    version: string;
}

/**
 * Generate an OpenAPI 3.1 document from the operation registry.
 *
 * Because operations carry their Zod input schema, the spec is derived, never
 * hand-maintained — the legacy server has no machine-readable API description at
 * all. The same Zod schemas can drive generated TypeScript clients for the SPA.
 */
export function generateOpenApi(registry: OperationRegistry, info: OpenApiInfo): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};

    for (const op of registry.all()) {
        const path = op.path.replace(/:(\w+)/g, "{$1}");
        const entry = (paths[path] ??= {});

        const operationObject: Record<string, unknown> = {
            operationId: op.name,
            summary: op.summary ?? op.name,
            security: op.auth ? [{ apiKey: [] }] : [],
            responses: {
                "200": { description: "Success" },
                "400": { description: "Bad Request" },
                "401": { description: "Unauthorized" }
            }
        };

        if (op.method !== "GET") {
            operationObject["requestBody"] = {
                content: { "application/json": { schema: zodToJsonSchema(op.input, { target: "openApi3" }) } }
            };
        }

        entry[op.method.toLowerCase()] = operationObject;
    }

    return {
        openapi: "3.1.0",
        info,
        paths,
        components: {
            securitySchemes: {
                apiKey: { type: "apiKey", in: "query", name: "password" }
            }
        }
    };
}
