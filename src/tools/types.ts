import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getResource } from "../pokeapi-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { PokemonType } from "../types.js";

export function registerGetTypeTool(server: McpServer) {
  server.registerTool(
    "get_type",
    {
      title: "Tabela de efetividade de um tipo",
      description:
        "Retorna a tabela de efetividade de dano de um tipo (ex: 'fire', 'water'): contra quais tipos causa " +
        "2x/0.5x/0x de dano, e de quais tipos recebe 2x/0.5x/0x de dano. Também lista os Pokémon desse tipo.",
      inputSchema: {
        name_or_id: z.string().describe("Nome (ex: 'fire', 'dragon') ou id do tipo."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const type = await getResource<PokemonType>("type", name_or_id);

        return jsonResult({
          id: type.id,
          name: type.name,
          offensive: {
            double_damage_to: type.damage_relations.double_damage_to.map((t) => t.name),
            half_damage_to: type.damage_relations.half_damage_to.map((t) => t.name),
            no_damage_to: type.damage_relations.no_damage_to.map((t) => t.name),
          },
          defensive: {
            double_damage_from: type.damage_relations.double_damage_from.map((t) => t.name),
            half_damage_from: type.damage_relations.half_damage_from.map((t) => t.name),
            no_damage_from: type.damage_relations.no_damage_from.map((t) => t.name),
          },
          pokemon_of_this_type: type.pokemon.map((p) => p.pokemon.name),
        });
      }),
  );
}
