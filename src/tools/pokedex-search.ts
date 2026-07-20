// src/tools/pokedex-search.ts
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getResource } from "../pokeapi-client.js";
import { findMatchingNames } from "../pokemon-search.js";
import { runTool } from "../tool-helpers.js";
import { POKEDEX_RESOURCE_URI } from "./pokedex-ui.js";
import type { Pokemon } from "../types.js";

const PokedexSearchResultItem = z.object({
  id: z.number(),
  name: z.string(),
  sprite: z.string().nullable(),
  types: z.array(z.string()),
});

export function registerPokedexSearchTool(server: McpServer) {
  registerAppTool(
    server,
    "pokedex_search",
    {
      title: "Busca Pokédex (com UI)",
      description:
        "Busca Pokémon por substring do nome e/ou filtra por tipo e/ou geração, e mostra os resultados " +
        "numa grade visual clicável (sprite, nome, tipos). Clicar num resultado abre o card de detalhe " +
        "via pokedex_view. Equivalente visual de search_pokemon — prefira esta quando o usuário quiser ver, " +
        "não só ler, os resultados.",
      inputSchema: {
        query: z.string().optional().describe("Substring do nome do Pokémon (case-insensitive)."),
        type: z.string().optional().describe("Filtra por tipo (ex: 'fire', 'dragon')."),
        generation: z
          .string()
          .optional()
          .describe("Filtra por geração (ex: 'generation-i', ou id numérico como string '1')."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe(
            "Máximo de resultados (padrão 24). Cada resultado custa uma consulta extra à PokéAPI " +
              "pra pegar sprite/tipos, por isso o teto é menor que o de search_pokemon.",
          ),
      },
      outputSchema: { results: z.array(PokedexSearchResultItem) },
      _meta: { ui: { resourceUri: POKEDEX_RESOURCE_URI } },
    },
    async ({ query, type, generation, limit }) =>
      runTool(async () => {
        const max = limit ?? 24;
        const names = await findMatchingNames({ query, type, generation });
        const page = names.slice(0, max);

        const results = await Promise.all(
          page.map(async (name) => {
            const pokemon = await getResource<Pokemon>("pokemon", name);
            return {
              id: pokemon.id,
              name: pokemon.name,
              sprite: pokemon.sprites.front_default,
              types: pokemon.types.map((t) => t.type.name),
            };
          }),
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `${names.length} Pokémon encontrado(s), mostrando ${results.length}.`,
            },
          ],
          structuredContent: { results },
        };
      }),
  );
}
