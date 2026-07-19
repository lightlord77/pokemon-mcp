import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { estimateIvCombos, pickNormalForm, resolveCandidateLevels, resolveGoPokemon } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoStatsEntry } from "../go-types.js";

export function registerGoEstimateIvTool(server: McpServer) {
  server.registerTool(
    "go_estimate_iv",
    {
      title: "Estima o IV de um Pokémon do Pokémon GO a partir de CP + HP",
      description:
        "Calcula quais combinações de IV (Attack/Defense/Stamina, 0-15 cada) são compatíveis com o CP e HP " +
        "observados de um Pokémon no Pokémon GO — o mesmo método usado por apps como PokeGenie/GoIV/Calcy IV. " +
        "Leia CP e HP na tela de detalhes do Pokémon (não na tela de apreciação com barras, que só dá uma " +
        "faixa aproximada). Informe 'level' se souber, ou 'stardust_cost' (o custo mostrado no botão de Power " +
        "Up) para restringir a 1-2 níveis candidatos — sem nenhum dos dois, o resultado pode incluir várias " +
        "combinações em níveis diferentes, todas matematicamente válidas mas ambíguas. LIMITAÇÃO: a fonte de " +
        "dados (PoGo API) só cobre níveis 1 a 45 — Pokémon nível 45.5+ (comum em Master League com XL candy " +
        "ou Best Buddy) não podem ser calculados por esta tool.",
      inputSchema: {
        name_or_id: z.string().describe("Nome (ex: 'Pikachu') ou id numérico do Pokémon."),
        cp: z.number().int().min(10).describe("CP observado do Pokémon."),
        hp: z.number().int().min(1).describe("HP máximo observado do Pokémon."),
        level: z
          .number()
          .min(1)
          .max(45)
          .optional()
          .describe(
            "Nível do Pokémon, se conhecido (1 a 45, incrementos de 0.5 — a fonte de dados não cobre níveis " +
              "acima de 45). Torna o resultado exato.",
          ),
        stardust_cost: z
          .number()
          .int()
          .optional()
          .describe("Custo de stardust mostrado no botão de Power Up — restringe a busca a 1-2 níveis candidatos."),
      },
    },
    async ({ name_or_id, cp, hp, level, stardust_cost }) =>
      runTool(async () => {
        const { id, name } = await resolveGoPokemon(name_or_id);
        const stats = await getGoData<GoStatsEntry[]>("pokemon_stats");
        const statsEntry = pickNormalForm(stats, id);
        if (!statsEntry) {
          throw new Error(`Stats não encontrados para '${name}' no Pokémon GO.`);
        }

        const candidateLevels = await resolveCandidateLevels(level, stardust_cost);
        const matches = await estimateIvCombos(statsEntry, candidateLevels, cp, hp);

        if (matches.length === 0) {
          throw new Error(
            `Nenhuma combinação de IV encontrada para '${name}' com CP ${cp} e HP ${hp} nos níveis testados. ` +
              `Confira se os números foram lidos corretamente na tela de detalhes do Pokémon (não na tela de apreciação).`,
          );
        }

        return jsonResult({
          pokemon: name,
          cp,
          hp,
          ambiguous_levels: level === undefined && stardust_cost === undefined,
          note:
            level === undefined && stardust_cost === undefined
              ? "Nenhum 'level' ou 'stardust_cost' foi informado — os resultados abaixo cobrem todos os níveis possíveis e podem ser ambíguos. Informe um dos dois para um resultado preciso."
              : null,
          matches,
        });
      }),
  );
}
