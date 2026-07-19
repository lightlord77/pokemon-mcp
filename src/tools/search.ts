import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFullList, getResource } from "../pokeapi-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { Generation, NamedAPIResourceList, PokemonType } from "../types.js";

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
        let candidateSets: Set<string>[] = [];

        if (type) {
          const typeData = await getResource<PokemonType>("type", type);
          candidateSets.push(new Set(typeData.pokemon.map((p) => p.pokemon.name)));
        }

        if (generation) {
          const genData = await getResource<Generation>("generation", generation);
          candidateSets.push(new Set(genData.pokemon_species.map((s) => s.name)));
        }

        if (query) {
          const list = await getFullList<NamedAPIResourceList>("pokemon");
          const needle = query.trim().toLowerCase();
          candidateSets.push(new Set(list.results.filter((r) => r.name.includes(needle)).map((r) => r.name)));
        }

        let names: string[];
        if (candidateSets.length === 0) {
          const list = await getFullList<NamedAPIResourceList>("pokemon");
          names = list.results.map((r) => r.name);
        } else {
          names = [...candidateSets.reduce((a, b) => new Set([...a].filter((x) => b.has(x))))];
        }

        names.sort();
        const total = names.length;
        const results = names.slice(0, max);

        return jsonResult({ total_matches: total, returned: results.length, results });
      }),
  );
}
