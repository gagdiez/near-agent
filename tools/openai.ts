// OpenAI SDK adapter for NearToolSet
// Converts Vercel AI SDK tools to the format OpenAI's client expects,
// and provides an executor to dispatch tool calls by name.
import type { Schema } from "ai";
import type { NearToolSet } from "./tools.js";

type OpenAITool = {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
};

/**
 * Convert a NearToolSet into the two things the OpenAI SDK needs:
 *
 *  - `definitions`  → pass to `openai.chat.completions.create({ tools: definitions })`
 *  - `execute(name, args)` → call in your tool-dispatch loop when the model returns a tool_call
 *
 * @example
 * ```ts
 * const { definitions, execute } = toOpenAITools(createNearTools({ ... }));
 *
 * const response = await openai.chat.completions.create({ model, messages, tools: definitions });
 *
 * for (const call of response.choices[0].message.tool_calls ?? []) {
 *   const result = await execute(call.function.name, JSON.parse(call.function.arguments));
 *   // push tool result back into messages…
 * }
 * ```
 */
export function toOpenAITools(tools: NearToolSet): {
    definitions: OpenAITool[];
    execute: (name: string, args: unknown) => Promise<unknown>;
} {
    const definitions: OpenAITool[] = Object.entries(tools).map(([name, t]) => ({
        type: "function",
        function: {
            name,
            description: t.description ?? "",
            // zodSchema() wraps the Zod schema into a Schema<T> with a .jsonSchema property
            parameters: (t.inputSchema as Schema<unknown>).jsonSchema as Record<string, unknown>,
        },
    }));

    const execute = async (name: string, args: unknown): Promise<unknown> => {
        const t = tools[name as keyof NearToolSet];
        if (!t) throw new Error(`Unknown NEAR tool: "${name}"`);
        // Vercel AI SDK tools expose execute() directly
        return (t as { execute: (args: unknown, opts: unknown) => Promise<unknown> })
            .execute(args, {});
    };

    return { definitions, execute };
}
