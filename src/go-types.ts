// Partial typings for the subset of PoGo API (pogoapi.net) response fields this server uses.
// See https://pogoapi.net/documentation/ for the full schema. Every endpoint is a whole JSON
// file (no per-resource REST paths), and most list entries carry a "form" field ("Normal",
// "Alolan", "Galarian", plus many costume/seasonal forms) since the same species can appear
// multiple times.

export interface GoNameEntry {
  id: number;
  name: string;
}

export type GoNamesById = Record<string, GoNameEntry>;

export interface GoStatsEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  base_attack: number;
  base_defense: number;
  base_stamina: number;
}

export interface GoTypesEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  type: string[];
}

export interface GoRarityEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  rarity: string;
}

export type GoRarityByClass = Record<string, GoRarityEntry[]>;

export interface GoShinyEntry {
  id: number;
  name: string;
  found_wild: boolean;
  found_raid: boolean;
  found_egg: boolean;
  found_research: boolean;
  found_photobomb: boolean;
  found_evolution: boolean;
}

export type GoShinyById = Record<string, GoShinyEntry>;

export interface GoMaxCpEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  max_cp: number;
}

export interface GoCpMultiplierEntry {
  level: number;
  multiplier: number;
}

export interface GoPowerupRequirement {
  current_level: number;
  level_after_powering: number;
  candy_to_upgrade: number;
  stardust_to_upgrade: number;
  xl_candy_to_upgrade: number;
}

export type GoPowerupRequirementsByLevel = Record<string, GoPowerupRequirement>;

export interface GoBuddyDistanceEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  distance: number;
}

export type GoBuddyDistancesByKm = Record<string, GoBuddyDistanceEntry[]>;

export interface GoMegaEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  mega_name: string;
  mega_energy_required: number;
  first_time_mega_energy_required: number;
  stats: { base_attack: number; base_defense: number; base_stamina: number };
  type: string[];
}

export interface GoCurrentMovesEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  fast_moves: string[];
  charged_moves: string[];
  elite_fast_moves: string[];
  elite_charged_moves: string[];
}

export interface GoFastMove {
  move_id: number;
  name: string;
  type: string;
  power: number;
  duration: number;
  energy_delta: number;
  stamina_loss_scaler: number;
}

export interface GoChargedMove {
  move_id: number;
  name: string;
  type: string;
  power: number;
  duration: number;
  energy_delta: number;
  critical_chance: number;
  stamina_loss_scaler: number;
}

export interface GoPvpBuffs {
  activation_chance?: number;
  target_attack_stat_stage_change?: number;
  target_defense_stat_stage_change?: number;
  attacker_attack_stat_stage_change?: number;
  attacker_defense_stat_stage_change?: number;
}

export interface GoPvpFastMove {
  move_id: number;
  name: string;
  type: string;
  power: number;
  energy_delta: number;
  turn_duration: number;
}

export interface GoPvpChargedMove {
  move_id: number;
  name: string;
  type: string;
  power: number;
  energy_delta: number;
  turn_duration: number;
  buffs?: GoPvpBuffs;
}

export interface GoEvolutionCondition {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  candy_required?: number;
  item_required?: string;
  lure_required?: string;
  buddy_distance_required?: number;
  must_be_buddy_to_evolve?: boolean;
  only_evolves_in_daytime?: boolean;
  only_evolves_in_nighttime?: boolean;
  gender_required?: string;
  no_candy_cost_if_traded?: boolean;
  upside_down?: boolean;
  priority?: number;
}

export interface GoEvolutionsEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  evolutions: GoEvolutionCondition[];
}

export interface GoRaidBoss {
  id: number;
  name: string;
  form: string;
  tier: number | string;
  type: string[];
  possible_shiny: boolean;
  boosted_weather: string[];
  min_boosted_cp: number;
  max_boosted_cp: number;
  min_unboosted_cp: number;
  max_unboosted_cp: number;
}

export interface GoRaidBosses {
  current: Record<string, GoRaidBoss[]>;
  previous: Record<string, GoRaidBoss[]>;
}

export interface GoEventMove {
  pokemon: string;
  move: string;
  move_type: string;
}

export interface GoCommunityDay {
  community_day_number: number;
  start_date: string;
  end_date: string;
  bonuses: string[];
  boosted_pokemon: string[];
  event_moves: GoEventMove[];
}
