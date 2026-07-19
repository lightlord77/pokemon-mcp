import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getResource } from "../pokeapi-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { Item } from "../types.js";

export function registerGetItemTool(server: McpServer) {
  server.registerTool(
    "get_item",
    {
      title: "Detalhe de um item",
      description:
        "Retorna os dados de um item do jogo (incluindo itens de evolução, berries, held items, etc.): " +
        "categoria, custo, efeito, descrição da Pokédex e sprite.",
      inputSchema: {
        name_or_id: z.string().describe("Nome (ex: 'thunder-stone', 'leftovers', 'oran-berry') ou id do item."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const item = await getResource<Item>("item", name_or_id);
        const englishEffect = item.effect_entries.find((e) => e.language.name === "en");
        const englishFlavor = item.flavor_text_entries.find((e) => e.language.name === "en");

        return jsonResult({
          id: item.id,
          name: item.name,
          category: item.category.name,
          cost: item.cost,
          effect: englishEffect?.effect ?? null,
          short_effect: englishEffect?.short_effect ?? null,
          flavor_text: englishFlavor?.text.replace(/[\n\f\r]+/g, " ") ?? null,
          attributes: item.attributes.map((a) => a.name),
          sprite: item.sprites.default,
        });
      }),
  );
}
