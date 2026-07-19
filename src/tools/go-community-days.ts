import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoCommunityDay } from "../go-types.js";

export function registerGoGetCommunityDaysTool(server: McpServer) {
  server.registerTool(
    "go_get_community_days",
    {
      title: "Histórico de Community Days do Pokémon GO",
      description:
        "Lista eventos de Community Day do Pokémon GO (data, bônus, Pokémon em destaque e move exclusivo " +
        "liberado no evento). Filtre por nome de Pokémon para ver em quais Community Days ele apareceu, ou " +
        "deixe em branco para ver os mais recentes.",
      inputSchema: {
        pokemon: z
          .string()
          .optional()
          .describe("Filtra Community Days em que este Pokémon foi destaque ou ganhou move exclusivo."),
        limit: z.number().int().min(1).max(100).optional().describe("Máximo de eventos retornados (padrão 10, mais recentes primeiro)."),
      },
    },
    async ({ pokemon, limit }) =>
      runTool(async () => {
        const all = await getGoData<GoCommunityDay[]>("community_days");
        const needle = pokemon?.trim().toLowerCase();

        let filtered = all;
        if (needle) {
          filtered = all.filter(
            (e) =>
              e.boosted_pokemon.some((p) => p.toLowerCase().includes(needle)) ||
              e.event_moves.some((m) => m.pokemon.toLowerCase().includes(needle)),
          );
        }

        const sorted = [...filtered].sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
        const max = limit ?? 10;

        return jsonResult({ total_matches: sorted.length, returned: Math.min(max, sorted.length), events: sorted.slice(0, max) });
      }),
  );
}
