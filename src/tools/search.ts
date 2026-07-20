import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { findMatchingNames } from "../pokemon-search.js";

export function registerSearchPokemonTool(server: McpServer) {
  server.registerTool(
    "search_pokemon",
    {
      title: "Busca/filtra Pokémon",
      description:
        "Busca Pokémon por substring do nome e/ou filtra por tipo e/ou geração. Combine filtros para " +
        "interseção (ex: query='saur' + type='poison'). Sem nenhum filtro, retorna os primeiros da lista geral. " +
        "Use os nomes retornados aqui como entrada para get_pokemon, get_pokemon_moves, etc.",
      inputSchema: {
        query: z.string().optional().describe("Substring do nome do Pokémon (case-insensitive)."),
        type: z.string().optional().describe("Filtra por tipo (ex: 'fire', 'dragon')."),
        generation: z
          .string()
          .optional()
          .describe("Filtra por geração (ex: 'generation-i', ou id numérico como string '1')."),
        limit: z.number().int().min(1).max(200).optional().describe("Máximo de resultados (padrão 50)."),
      },
    },
    async ({ query, type, generation, limit }) =>
      runTool(async () => {
        const max = limit ?? 50;
        const names = await findMatchingNames({ query, type, generation });
        const results = names.slice(0, max);
        return jsonResult({ total_matches: names.length, returned: results.length, results });
      }),
  );
}
