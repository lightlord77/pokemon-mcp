import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { resolveGoPokemon } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type {
  GoChargedMove,
  GoCurrentMovesEntry,
  GoFastMove,
  GoPvpChargedMove,
  GoPvpFastMove,
} from "../go-types.js";

async function loadMoveTables() {
  const [fast, charged, pvpFast, pvpCharged] = await Promise.all([
    getGoData<GoFastMove[]>("fast_moves"),
    getGoData<GoChargedMove[]>("charged_moves"),
    getGoData<GoPvpFastMove[]>("pvp_fast_moves"),
    getGoData<GoPvpChargedMove[]>("pvp_charged_moves"),
  ]);
  return { fast, charged, pvpFast, pvpCharged };
}

function buildFastMoveDetail(name: string, tables: Awaited<ReturnType<typeof loadMoveTables>>) {
  const raid = tables.fast.find((m) => m.name === name) ?? null;
  const pvp = tables.pvpFast.find((m) => m.name === name) ?? null;
  return { name, raid, pvp };
}

function buildChargedMoveDetail(name: string, tables: Awaited<ReturnType<typeof loadMoveTables>>) {
  const raid = tables.charged.find((m) => m.name === name) ?? null;
  const pvp = tables.pvpCharged.find((m) => m.name === name) ?? null;
  return { name, raid, pvp };
}

export function registerGoGetPokemonMovesTool(server: McpServer) {
  server.registerTool(
    "go_get_pokemon_moves",
    {
      title: "Moveset de um Pokémon no Pokémon GO",
      description:
        "Retorna o moveset atual de um Pokémon no Pokémon GO (fast moves e charged moves, incluindo os que só " +
        "são obtidos via Elite TM/evento legado), com os dados completos de cada move tanto para raids/PvE " +
        "(power, duration, energy_delta) quanto para PvP (power, turn_duration, energy_delta, buffs).",
      inputSchema: {
        name_or_id: z.string().describe("Nome (ex: 'Pikachu') ou id numérico do Pokémon."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const { id, name } = await resolveGoPokemon(name_or_id);
        const [movesList, tables] = await Promise.all([
          getGoData<GoCurrentMovesEntry[]>("current_pokemon_moves"),
          loadMoveTables(),
        ]);

        const entry = movesList.find((m) => m.pokemon_id === id && m.form === "Normal") ??
          movesList.find((m) => m.pokemon_id === id);

        if (!entry) {
          throw new Error(`Nenhum moveset encontrado para '${name}' no Pokémon GO.`);
        }

        return jsonResult({
          pokemon: name,
          fast_moves: entry.fast_moves.map((m) => ({
            ...buildFastMoveDetail(m, tables),
            elite: entry.elite_fast_moves.includes(m),
          })),
          elite_only_fast_moves: entry.elite_fast_moves
            .filter((m) => !entry.fast_moves.includes(m))
            .map((m) => ({ ...buildFastMoveDetail(m, tables), elite: true })),
          charged_moves: entry.charged_moves.map((m) => ({
            ...buildChargedMoveDetail(m, tables),
            elite: entry.elite_charged_moves.includes(m),
          })),
          elite_only_charged_moves: entry.elite_charged_moves
            .filter((m) => !entry.charged_moves.includes(m))
            .map((m) => ({ ...buildChargedMoveDetail(m, tables), elite: true })),
        });
      }),
  );
}

export function registerGoGetMoveTool(server: McpServer) {
  server.registerTool(
    "go_get_move",
    {
      title: "Detalhe de um move no Pokémon GO",
      description:
        "Retorna os dados completos de um move específico no Pokémon GO, tanto para o contexto de raids/PvE " +
        "(power, duration, energy_delta) quanto para PvP (power, turn_duration, energy_delta, buffs de stat).",
      inputSchema: {
        name: z.string().describe("Nome do move (ex: 'Thunderbolt', 'Frenzy Plant')."),
      },
    },
    async ({ name }) =>
      runTool(async () => {
        const tables = await loadMoveTables();
        const needle = name.trim().toLowerCase();

        const fastMatch = tables.fast.find((m) => m.name.toLowerCase() === needle);
        if (fastMatch) return jsonResult(buildFastMoveDetail(fastMatch.name, tables));

        const chargedMatch = tables.charged.find((m) => m.name.toLowerCase() === needle);
        if (chargedMatch) return jsonResult(buildChargedMoveDetail(chargedMatch.name, tables));

        throw new Error(`Move '${name}' não encontrado nos dados do Pokémon GO.`);
      }),
  );
}
