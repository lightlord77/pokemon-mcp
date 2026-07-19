import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { calculateCp, pickNormalForm, resolveGoPokemon } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type {
  GoBuddyDistancesByKm,
  GoMaxCpEntry,
  GoMegaEntry,
  GoNamesById,
  GoRarityByClass,
  GoShinyById,
  GoStatsEntry,
  GoTypesEntry,
} from "../go-types.js";

export function registerGoGetPokemonTool(server: McpServer) {
  server.registerTool(
    "go_get_pokemon",
    {
      title: "Perfil de um Pokémon no Pokémon GO",
      description:
        "Retorna o perfil de um Pokémon especificamente no contexto do Pokémon GO: stats base (attack/defense/" +
        "stamina, escala diferente dos jogos principais), tipos, raridade, se já foi lançado no jogo, " +
        "disponibilidade de shiny (selvagem/raid/ovo/pesquisa/photobomb/evolução), CP máximo no nível 40, " +
        "distância de buddy para candy, formas regionais (Alolan/Galarian) e shadow disponíveis, e informações " +
        "de Mega Evolução (custo de energia, stats mega) quando existir. Opcionalmente informe 'level' (e IVs) " +
        "para calcular o CP real nesse nível.",
      inputSchema: {
        name_or_id: z.string().describe("Nome (ex: 'Pikachu') ou id numérico do Pokémon."),
        level: z
          .number()
          .min(1)
          .max(45)
          .optional()
          .describe("Nível (1 a 45, incrementos de 0.5) para calcular o CP real. Requer IVs opcionalmente."),
        attack_iv: z.number().int().min(0).max(15).optional().describe("IV de ataque (0-15). Padrão 15 (perfeito)."),
        defense_iv: z.number().int().min(0).max(15).optional().describe("IV de defesa (0-15). Padrão 15."),
        stamina_iv: z.number().int().min(0).max(15).optional().describe("IV de stamina (0-15). Padrão 15."),
      },
    },
    async ({ name_or_id, level, attack_iv, defense_iv, stamina_iv }) =>
      runTool(async () => {
        const { id, name } = await resolveGoPokemon(name_or_id);

        const [stats, types, rarity, released, shiny, maxCp, buddyDistances, megas, alolan, galarian, shadow] =
          await Promise.all([
            getGoData<GoStatsEntry[]>("pokemon_stats"),
            getGoData<GoTypesEntry[]>("pokemon_types"),
            getGoData<GoRarityByClass>("pokemon_rarity"),
            getGoData<GoNamesById>("released_pokemon"),
            getGoData<GoShinyById>("shiny_pokemon"),
            getGoData<GoMaxCpEntry[]>("pokemon_max_cp"),
            getGoData<GoBuddyDistancesByKm>("pokemon_buddy_distances"),
            getGoData<GoMegaEntry[]>("mega_pokemon"),
            getGoData<GoNamesById>("alolan_pokemon"),
            getGoData<GoNamesById>("galarian_pokemon"),
            getGoData<GoNamesById>("shadow_pokemon"),
          ]);

        const statsEntry = pickNormalForm(stats, id);
        const typesEntry = pickNormalForm(types, id);
        const maxCpEntry = pickNormalForm(maxCp, id);

        let rarityLabel: string | null = null;
        for (const [label, entries] of Object.entries(rarity)) {
          if (entries.some((e) => e.pokemon_id === id)) {
            rarityLabel = label;
            break;
          }
        }

        let buddyDistanceKm: number | null = null;
        for (const entries of Object.values(buddyDistances)) {
          const match = entries.find((e) => e.pokemon_id === id && e.form === "Normal");
          if (match) {
            buddyDistanceKm = match.distance;
            break;
          }
        }

        const megaForms = megas
          .filter((m) => m.pokemon_id === id)
          .map((m) => ({
            mega_name: m.mega_name,
            form: m.form,
            mega_energy_required: m.mega_energy_required,
            first_time_mega_energy_required: m.first_time_mega_energy_required,
            type: m.type,
            stats: m.stats,
          }));

        const shinyEntry = shiny[String(id)] ?? null;

        let calculated_cp: number | null = null;
        if (level !== undefined && statsEntry) {
          calculated_cp = await calculateCp(statsEntry, level, {
            attack: attack_iv ?? 15,
            defense: defense_iv ?? 15,
            stamina: stamina_iv ?? 15,
          });
        }

        return jsonResult({
          id,
          name,
          released_in_go: Boolean(released[String(id)]),
          rarity: rarityLabel,
          types: typesEntry?.type ?? null,
          base_stats: statsEntry
            ? {
                attack: statsEntry.base_attack,
                defense: statsEntry.base_defense,
                stamina: statsEntry.base_stamina,
              }
            : null,
          max_cp_at_level_40: maxCpEntry?.max_cp ?? null,
          calculated_cp:
            calculated_cp !== null
              ? {
                  level,
                  ivs: { attack: attack_iv ?? 15, defense: defense_iv ?? 15, stamina: stamina_iv ?? 15 },
                  cp: calculated_cp,
                }
              : null,
          buddy_distance_km: buddyDistanceKm,
          shiny_availability: shinyEntry,
          mega_forms: megaForms,
          has_alolan_form: Boolean(alolan[String(id)]),
          has_galarian_form: Boolean(galarian[String(id)]),
          shadow_available: Boolean(shadow[String(id)]),
        });
      }),
  );
}
