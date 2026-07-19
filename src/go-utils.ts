import { getGoData } from "./go-client.js";
import type { GoCpMultiplierEntry, GoNamesById, GoPowerupRequirementsByLevel } from "./go-types.js";

export class GoPokemonNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Pokémon '${identifier}' não encontrado nos dados do Pokémon GO.`);
    this.name = "GoPokemonNotFoundError";
  }
}

/** Resolves a user-supplied name or numeric id to the canonical {id, name} via pokemon_names.json. */
export async function resolveGoPokemon(identifier: string): Promise<{ id: number; name: string }> {
  const names = await getGoData<GoNamesById>("pokemon_names");

  if (/^\d+$/.test(identifier.trim())) {
    const entry = names[identifier.trim()];
    if (!entry) throw new GoPokemonNotFoundError(identifier);
    return entry;
  }

  const needle = identifier.trim().toLowerCase();
  const match = Object.values(names).find((n) => n.name.toLowerCase() === needle);
  if (!match) throw new GoPokemonNotFoundError(identifier);
  return match;
}

export function pickNormalForm<T extends { pokemon_id: number; form: string }>(
  entries: T[],
  id: number,
): T | undefined {
  return entries.find((e) => e.pokemon_id === id && e.form === "Normal") ?? entries.find((e) => e.pokemon_id === id);
}

type BaseStats = { base_attack: number; base_defense: number; base_stamina: number };
type Ivs = { attack: number; defense: number; stamina: number };

/**
 * Official Pokémon GO CP formula: CP = max(10, floor(
 *   (baseAttack + atkIV) * sqrt(baseDefense + defIV) * sqrt(baseStamina + staIV) * multiplier^2 / 10
 * )), where multiplier is the CP multiplier for the given level (1-45, half-levels included).
 */
function cpFormula(base: BaseStats, multiplier: number, ivs: Ivs): number {
  const attack = base.base_attack + ivs.attack;
  const defense = base.base_defense + ivs.defense;
  const stamina = base.base_stamina + ivs.stamina;
  const cp = Math.floor((attack * Math.sqrt(defense) * Math.sqrt(stamina) * multiplier ** 2) / 10);
  return Math.max(10, cp);
}

/** HP formula: HP = floor((baseStamina + staminaIV) * multiplier). */
function hpFormula(baseStamina: number, staminaIv: number, multiplier: number): number {
  return Math.floor((baseStamina + staminaIv) * multiplier);
}

async function loadCpMultiplierTable(): Promise<GoCpMultiplierEntry[]> {
  return getGoData<GoCpMultiplierEntry[]>("cp_multiplier");
}

export async function calculateCp(base: BaseStats, level: number, ivs: Ivs): Promise<number> {
  const table = await loadCpMultiplierTable();
  const entry = table.find((e) => e.level === level);
  if (!entry) {
    const min = table[0].level;
    const max = table[table.length - 1].level;
    throw new Error(`Nível ${level} inválido. Use um valor entre ${min} e ${max}, em incrementos de 0.5.`);
  }
  return cpFormula(base, entry.multiplier, ivs);
}

/**
 * Resolves which level(s) to brute-force over when estimating IVs:
 * - an explicit level, if given, is used as-is;
 * - otherwise a stardust power-up cost narrows it to the (usually 1-2) levels that cost that much,
 *   since pokemon_powerup_requirements.json keys stardust cost by current_level and the same cost
 *   is shared by consecutive half-levels;
 * - with neither hint, every level in the CP multiplier table is a candidate (ambiguous fallback).
 */
export async function resolveCandidateLevels(explicitLevel?: number, stardustCost?: number): Promise<number[]> {
  const table = await loadCpMultiplierTable();

  if (explicitLevel !== undefined) {
    if (!table.some((e) => e.level === explicitLevel)) {
      const min = table[0].level;
      const max = table[table.length - 1].level;
      throw new Error(
        `Nível ${explicitLevel} não é suportado pelos dados da PoGo API (cobrem de ${min} a ${max}, em ` +
          `incrementos de 0.5). Pokémon acima do nível ${max} (ex: level 50/51 de Master League) não podem ` +
          `ser calculados com a fonte de dados atual.`,
      );
    }
    return [explicitLevel];
  }

  if (stardustCost !== undefined) {
    const requirements = await getGoData<GoPowerupRequirementsByLevel>("pokemon_powerup_requirements");
    const levels = Object.values(requirements)
      .filter((r) => r.stardust_to_upgrade === stardustCost)
      .map((r) => r.current_level);
    if (levels.length === 0) {
      throw new Error(`Nenhum nível encontrado com custo de stardust ${stardustCost}.`);
    }
    return levels;
  }

  return table.map((e) => e.level);
}

export interface IvMatch {
  level: number;
  attack_iv: number;
  defense_iv: number;
  stamina_iv: number;
  iv_percent: number;
}

/**
 * Brute-forces every IV combination (0-15 each, 4096 total) across the candidate levels and keeps
 * only the ones whose computed CP and HP match the observed values exactly — the same approach
 * IV calculator apps (PokeGenie, GoIV, Calcy IV) use internally.
 */
export async function estimateIvCombos(
  base: BaseStats,
  candidateLevels: number[],
  targetCp: number,
  targetHp: number,
): Promise<IvMatch[]> {
  const table = await loadCpMultiplierTable();
  const multiplierByLevel = new Map(table.map((e) => [e.level, e.multiplier]));

  const matches: IvMatch[] = [];
  for (const level of candidateLevels) {
    const multiplier = multiplierByLevel.get(level);
    if (multiplier === undefined) continue;

    for (let attack = 0; attack <= 15; attack++) {
      for (let defense = 0; defense <= 15; defense++) {
        for (let stamina = 0; stamina <= 15; stamina++) {
          const hp = hpFormula(base.base_stamina, stamina, multiplier);
          if (hp !== targetHp) continue;
          const cp = cpFormula(base, multiplier, { attack, defense, stamina });
          if (cp !== targetCp) continue;
          matches.push({
            level,
            attack_iv: attack,
            defense_iv: defense,
            stamina_iv: stamina,
            iv_percent: Math.round(((attack + defense + stamina) / 45) * 1000) / 10,
          });
        }
      }
    }
  }

  matches.sort((a, b) => b.iv_percent - a.iv_percent);
  return matches;
}
