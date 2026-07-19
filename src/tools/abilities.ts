import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getResource } from "../pokeapi-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { Ability } from "../types.js";

export function registerGetAbilityTool(server: McpServer) {
  server.registerTool(
    "get_ability",
    {
      title: "Detalhe de uma ability",
      description:
        "Retorna o efeito completo e resumido de uma ability (habilidade passiva), geração em que foi " +
        "introduzida, e a lista de Pokémon que podem tê-la (incluindo se é uma hidden ability).",
      inputSchema: {
        name_or_id: z.string().describe("Nome (ex: 'intimidate', 'levitate') ou id da ability."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const ability = await getResource<Ability>("ability", name_or_id);
        const englishEffect = ability.effect_entries.find((e) => e.language.name === "en");
        const englishFlavor = ability.flavor_text_entries.find((e) => e.language.name === "en");

        return jsonResult({
          id: ability.id,
          name: ability.name,
          generation: ability.generation.name,
          effect: englishEffect?.effect ?? null,
          short_effect: englishEffect?.short_effect ?? null,
          flavor_text: englishFlavor?.flavor_text.replace(/[\n\f\r]+/g, " ") ?? null,
          pokemon_with_this_ability: ability.pokemon.map((p) => ({
            name: p.pokemon.name,
            is_hidden: p.is_hidden,
          })),
        });
      }),
  );
}
