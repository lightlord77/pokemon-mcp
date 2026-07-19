import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getResource } from "../pokeapi-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { idFromUrl } from "../utils.js";
import type { Pokemon, Move, VersionGroup } from "../types.js";

const KNOWN_LEARN_METHODS = new Set(["level-up", "machine", "egg", "tutor"]);

/**
 * Resolves which single version_group to use when the caller didn't specify one, so the
 * returned move list corresponds to one actual game instead of mixing entries from different
 * games per move.
 *
 * Only groups that have at least one entry using a method this tool models (level-up/machine/
 * egg/tutor) are eligible — some spinoffs (e.g. "champions") only use non-standard methods like
 * "train" and would otherwise be picked while yielding an empty result.
 *
 * Ranking is by the version-group's generation id (chronological by construction: generation-i
 * is always older than generation-ii, etc.), then by version-group id as a tiebreak within the
 * same generation. Generation id is used as the primary key rather than version-group id alone
 * because PokéAPI added some resources out of release order — e.g. the Japan-exclusive
 * "red-green-japan"/"blue-japan" (Generation I) were assigned version-group ids higher than
 * Generation VIII/IX groups, which would otherwise make a 1996 game look "most recent".
 */
async function resolveDefaultVersionGroup(pokemon: Pokemon): Promise<string> {
  const present = new Set<string>();
  for (const entry of pokemon.moves) {
    for (const detail of entry.version_group_details) {
      if (KNOWN_LEARN_METHODS.has(detail.move_learn_method.name)) {
        present.add(detail.version_group.name);
      }
    }
  }

  if (present.size === 0) {
    throw new Error(`Nenhum version_group com moves reconhecidos encontrado para '${pokemon.name}'.`);
  }

  const candidates = await Promise.all(
    [...present].map(async (name) => {
      const group = await getResource<VersionGroup>("version-group", name);
      return { name, versionGroupId: group.id, generationId: idFromUrl(group.generation.url) };
    }),
  );

  candidates.sort((a, b) => b.generationId - a.generationId || b.versionGroupId - a.versionGroupId);
  return candidates[0].name;
}

export function registerGetPokemonMovesTool(server: McpServer) {
  server.registerTool(
    "get_pokemon_moves",
    {
      title: "Moves aprendíveis por um Pokémon",
      description:
        "Lista os ataques (moves) que um Pokémon pode aprender, agrupados por método de aprendizado " +
        "(level-up com o nível exato, TM/HM, egg move, tutor). Por padrão resolve automaticamente o " +
        "version_group mais recente em que o Pokémon está disponível, garantindo que todos os moves e " +
        "níveis retornados sejam consistentes com um único jogo; opcionalmente filtre por método ou por " +
        "version_group específico (ex: 'scarlet-violet').",
      inputSchema: {
        name_or_id: z.string().describe("Nome ou id do Pokémon."),
        method: z
          .enum(["level-up", "machine", "egg", "tutor"])
          .optional()
          .describe("Filtra apenas por este método de aprendizado."),
        version_group: z
          .string()
          .optional()
          .describe("Filtra por um version_group específico da PokéAPI (ex: 'scarlet-violet', 'sword-shield')."),
      },
    },
    async ({ name_or_id, method, version_group }) =>
      runTool(async () => {
        const pokemon = await getResource<Pokemon>("pokemon", name_or_id);
        const resolvedVersionGroup = version_group ?? (await resolveDefaultVersionGroup(pokemon));

        const levelUp: { move: string; level: number }[] = [];
        const machine: string[] = [];
        const egg: string[] = [];
        const tutor: string[] = [];

        for (const entry of pokemon.moves) {
          const detail = entry.version_group_details.find(
            (d) => d.version_group.name === resolvedVersionGroup,
          );
          if (!detail) continue;
          const learnMethod = detail.move_learn_method.name;
          if (method && learnMethod !== method) continue;

          if (learnMethod === "level-up") {
            levelUp.push({ move: entry.move.name, level: detail.level_learned_at });
          } else if (learnMethod === "machine") {
            machine.push(entry.move.name);
          } else if (learnMethod === "egg") {
            egg.push(entry.move.name);
          } else if (learnMethod === "tutor") {
            tutor.push(entry.move.name);
          }
        }

        levelUp.sort((a, b) => a.level - b.level);

        return jsonResult({
          pokemon: pokemon.name,
          version_group_used: resolvedVersionGroup,
          level_up: levelUp,
          machine: machine.sort(),
          egg: egg.sort(),
          tutor: tutor.sort(),
        });
      }),
  );
}

export function registerGetMoveTool(server: McpServer) {
  server.registerTool(
    "get_move",
    {
      title: "Detalhe completo de um ataque (move)",
      description:
        "Retorna os dados completos de um ataque: poder, precisão, PP, tipo, classe de dano " +
        "(física/especial/status), prioridade, alvo, efeito e chance de efeito, e metadados de batalha " +
        "(ailment causado, taxa de crítico, drain, cura, chance de flinch, mudanças de stat).",
      inputSchema: {
        name_or_id: z.string().describe("Nome (ex: 'thunderbolt', 'flamethrower') ou id do move."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const move = await getResource<Move>("move", name_or_id);
        const englishEffect = move.effect_entries.find((e) => e.language.name === "en");

        return jsonResult({
          id: move.id,
          name: move.name,
          type: move.type.name,
          damage_class: move.damage_class.name,
          power: move.power,
          accuracy: move.accuracy,
          pp: move.pp,
          priority: move.priority,
          target: move.target.name,
          effect: englishEffect?.effect.replace("$effect_chance", String(move.effect_chance ?? "")) ?? null,
          effect_chance: move.effect_chance,
          stat_changes: move.stat_changes.map((s) => ({ stat: s.stat.name, change: s.change })),
          meta: move.meta,
          taught_by_machine_in_version_groups: [...new Set(move.machines.map((m) => m.version_group.name))],
        });
      }),
  );
}
