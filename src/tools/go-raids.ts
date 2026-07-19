import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoRaidBoss, GoRaidBosses } from "../go-types.js";

export function registerGoGetRaidBossesTool(server: McpServer) {
  server.registerTool(
    "go_get_raid_bosses",
    {
      title: "Raid bosses do Pokémon GO",
      description:
        "Lista os raid bosses atuais (ou anteriores) do Pokémon GO, com tier, tipos, chance de shiny, clima " +
        "que dá boost, e faixas de CP (com e sem boost de clima) tanto para o boss quanto para captura. " +
        "Filtre por tier ('1'..'6', 'ex', 'mega', 'mega_legendary') e/ou por nome do Pokémon.",
      inputSchema: {
        tier: z
          .string()
          .optional()
          .describe("Filtra por tier: '1', '2', '3', '4', '5', '6', 'ex', 'mega' ou 'mega_legendary'."),
        name: z.string().optional().describe("Filtra por substring do nome do Pokémon (case-insensitive)."),
        include_previous: z
          .boolean()
          .optional()
          .describe("Se true, inclui também a rotação anterior de bosses (padrão: só a atual)."),
      },
    },
    async ({ tier, name, include_previous }) =>
      runTool(async () => {
        const data = await getGoData<GoRaidBosses>("raid_bosses");
        const needle = name?.trim().toLowerCase();

        function collect(byTier: Record<string, GoRaidBoss[]>): (GoRaidBoss & { rotation: string })[] {
          const rotation = byTier === data.current ? "current" : "previous";
          const tiers = tier ? [tier] : Object.keys(byTier);
          const results: (GoRaidBoss & { rotation: string })[] = [];
          for (const t of tiers) {
            const bosses = byTier[t] ?? [];
            for (const boss of bosses) {
              if (needle && !boss.name.toLowerCase().includes(needle)) continue;
              results.push({ ...boss, rotation });
            }
          }
          return results;
        }

        const bosses = [...collect(data.current), ...(include_previous ? collect(data.previous) : [])];

        return jsonResult({ total: bosses.length, bosses });
      }),
  );
}
