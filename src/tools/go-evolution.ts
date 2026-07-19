import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { resolveGoPokemon } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoEvolutionCondition, GoEvolutionsEntry } from "../go-types.js";

function describeCondition(ev: GoEvolutionCondition): string {
  const parts: string[] = [];
  if (ev.candy_required) parts.push(`${ev.candy_required} candy`);
  if (ev.item_required) parts.push(`usando '${ev.item_required}'`);
  if (ev.lure_required) parts.push(`perto de um '${ev.lure_required}' ativo`);
  if (ev.buddy_distance_required) parts.push(`tendo andado ${ev.buddy_distance_required}km como buddy`);
  if (ev.must_be_buddy_to_evolve) parts.push("precisa ser o buddy atual no momento da evolução");
  if (ev.only_evolves_in_daytime) parts.push("apenas durante o dia");
  if (ev.only_evolves_in_nighttime) parts.push("apenas durante a noite");
  if (ev.gender_required) parts.push(`apenas gênero '${ev.gender_required}'`);
  if (ev.no_candy_cost_if_traded) parts.push("sem custo de candy se for um Pokémon trocado");
  if (ev.upside_down) parts.push("com o dispositivo de cabeça para baixo");
  return parts.length > 0 ? parts.join(", ") : "sem condições especiais além de estar disponível";
}

function buildNode(
  id: number,
  byId: Map<number, GoEvolutionsEntry>,
  fallbackName: string,
): Record<string, unknown> {
  const entry = byId.get(id);
  const species = entry?.pokemon_name ?? fallbackName;
  if (!entry || entry.evolutions.length === 0) {
    return { species, evolves_to: [] };
  }

  return {
    species,
    evolves_to: entry.evolutions.map((ev) => ({
      condition: describeCondition(ev),
      ...buildNode(ev.pokemon_id, byId, ev.pokemon_name),
    })),
  };
}

export function registerGoGetEvolutionTool(server: McpServer) {
  server.registerTool(
    "go_get_evolution",
    {
      title: "Cadeia de evolução no Pokémon GO",
      description:
        "Retorna a árvore de evolução de um Pokémon com as regras específicas do Pokémon GO: quantidade de " +
        "candy, item necessário (ex: 'Metal Coat'), lure module necessário, distância andada como buddy, se " +
        "precisa ser o buddy no momento, restrição de horário (dia/noite) e de gênero. Diferente dos jogos " +
        "principais, no GO não há evolução por nível — é sempre candy (+ opcionalmente uma condição extra).",
      inputSchema: {
        name_or_id: z.string().describe("Nome ou id de qualquer Pokémon da cadeia (não precisa ser o estágio base)."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const { id, name } = await resolveGoPokemon(name_or_id);
        const all = await getGoData<GoEvolutionsEntry[]>("pokemon_evolutions");

        const byId = new Map<number, GoEvolutionsEntry>();
        const parentOf = new Map<number, number>();
        for (const entry of all) {
          if (entry.form !== "Normal") continue;
          byId.set(entry.pokemon_id, entry);
          for (const ev of entry.evolutions) {
            parentOf.set(ev.pokemon_id, entry.pokemon_id);
          }
        }

        let rootId = id;
        const seen = new Set<number>();
        while (parentOf.has(rootId) && !seen.has(rootId)) {
          seen.add(rootId);
          rootId = parentOf.get(rootId)!;
        }

        const tree = buildNode(rootId, byId, name);
        return jsonResult({ base_species_id: rootId, chain: tree });
      }),
  );
}
