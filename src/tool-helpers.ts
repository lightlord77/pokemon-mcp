import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { PokeApiNotFoundError } from "./pokeapi-client.js";
import { GoPokemonNotFoundError } from "./go-utils.js";

export function jsonResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/** Runs a tool handler, translating known not-found errors into a friendly tool error instead of crashing. */
export async function runTool(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PokeApiNotFoundError || err instanceof GoPokemonNotFoundError) {
      return errorResult(err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Erro ao consultar a API: ${message}`);
  }
}
