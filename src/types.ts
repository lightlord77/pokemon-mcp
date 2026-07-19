// Partial typings for the subset of PokéAPI v2 response fields this server uses.
// See https://pokeapi.co/docs/v2 for the full schema.

export interface NamedAPIResource {
  name: string;
  url: string;
}

export interface PokemonSprites {
  front_default: string | null;
  front_shiny: string | null;
  back_default: string | null;
  back_shiny: string | null;
  front_female?: string | null;
  front_shiny_female?: string | null;
  other?: {
    "official-artwork"?: { front_default: string | null; front_shiny?: string | null };
    home?: { front_default: string | null; front_shiny: string | null };
    showdown?: { front_default: string | null; front_shiny: string | null; back_default: string | null; back_shiny: string | null };
    dream_world?: { front_default: string | null };
  };
}

export interface PokemonStat {
  base_stat: number;
  effort: number;
  stat: NamedAPIResource;
}

export interface PokemonAbilitySlot {
  ability: NamedAPIResource;
  is_hidden: boolean;
  slot: number;
}

export interface PokemonTypeSlot {
  slot: number;
  type: NamedAPIResource;
}

export interface VersionGroupMoveDetail {
  level_learned_at: number;
  move_learn_method: NamedAPIResource;
  version_group: NamedAPIResource;
}

export interface PokemonMove {
  move: NamedAPIResource;
  version_group_details: VersionGroupMoveDetail[];
}

export interface Pokemon {
  id: number;
  name: string;
  height: number;
  weight: number;
  base_experience: number | null;
  order: number;
  is_default: boolean;
  types: PokemonTypeSlot[];
  abilities: PokemonAbilitySlot[];
  stats: PokemonStat[];
  sprites: PokemonSprites;
  moves: PokemonMove[];
  species: NamedAPIResource;
  held_items: { item: NamedAPIResource }[];
}

export interface FlavorTextEntry {
  flavor_text: string;
  language: NamedAPIResource;
  version: NamedAPIResource;
}

export interface Genus {
  genus: string;
  language: NamedAPIResource;
}

export interface PokemonSpecies {
  id: number;
  name: string;
  order: number;
  gender_rate: number;
  capture_rate: number;
  base_happiness: number | null;
  is_baby: boolean;
  is_legendary: boolean;
  is_mythical: boolean;
  hatch_counter: number;
  has_gender_differences: boolean;
  growth_rate: NamedAPIResource;
  egg_groups: NamedAPIResource[];
  color: NamedAPIResource;
  habitat: NamedAPIResource | null;
  generation: NamedAPIResource;
  evolves_from_species: NamedAPIResource | null;
  evolution_chain: { url: string };
  flavor_text_entries: FlavorTextEntry[];
  genera: Genus[];
  varieties: { is_default: boolean; pokemon: NamedAPIResource }[];
}

export interface EvolutionDetail {
  item: NamedAPIResource | null;
  trigger: NamedAPIResource;
  gender: number | null;
  held_item: NamedAPIResource | null;
  known_move: NamedAPIResource | null;
  known_move_type: NamedAPIResource | null;
  location: NamedAPIResource | null;
  min_level: number | null;
  min_happiness: number | null;
  min_beauty: number | null;
  min_affection: number | null;
  needs_overworld_rain: boolean;
  party_species: NamedAPIResource | null;
  party_type: NamedAPIResource | null;
  relative_physical_stats: number | null;
  time_of_day: string;
  trade_species: NamedAPIResource | null;
  turn_upside_down: boolean;
}

export interface ChainLink {
  is_baby: boolean;
  species: NamedAPIResource;
  evolution_details: EvolutionDetail[];
  evolves_to: ChainLink[];
}

export interface EvolutionChain {
  id: number;
  chain: ChainLink;
}

export interface VerboseEffect {
  effect: string;
  short_effect: string;
  language: NamedAPIResource;
}

export interface MoveMeta {
  ailment: NamedAPIResource;
  category: NamedAPIResource;
  min_hits: number | null;
  max_hits: number | null;
  min_turns: number | null;
  max_turns: number | null;
  drain: number;
  healing: number;
  crit_rate: number;
  ailment_chance: number;
  flinch_chance: number;
  stat_chance: number;
}

export interface Move {
  id: number;
  name: string;
  accuracy: number | null;
  effect_chance: number | null;
  pp: number | null;
  priority: number;
  power: number | null;
  damage_class: NamedAPIResource;
  type: NamedAPIResource;
  target: NamedAPIResource;
  meta: MoveMeta | null;
  effect_entries: VerboseEffect[];
  flavor_text_entries: FlavorTextEntry[];
  stat_changes: { change: number; stat: NamedAPIResource }[];
  machines: { machine: { url: string }; version_group: NamedAPIResource }[];
}

export interface AbilityEffectEntry extends VerboseEffect {}

export interface Ability {
  id: number;
  name: string;
  is_main_series: boolean;
  generation: NamedAPIResource;
  effect_entries: AbilityEffectEntry[];
  flavor_text_entries: FlavorTextEntry[];
  pokemon: { is_hidden: boolean; slot: number; pokemon: NamedAPIResource }[];
}

export interface TypeRelations {
  no_damage_to: NamedAPIResource[];
  half_damage_to: NamedAPIResource[];
  double_damage_to: NamedAPIResource[];
  no_damage_from: NamedAPIResource[];
  half_damage_from: NamedAPIResource[];
  double_damage_from: NamedAPIResource[];
}

export interface PokemonType {
  id: number;
  name: string;
  damage_relations: TypeRelations;
  pokemon: { slot: number; pokemon: NamedAPIResource }[];
  moves: NamedAPIResource[];
}

export interface ItemSprites {
  default: string | null;
}

export interface Item {
  id: number;
  name: string;
  cost: number;
  category: NamedAPIResource;
  sprites: ItemSprites;
  effect_entries: VerboseEffect[];
  flavor_text_entries: { text: string; language: NamedAPIResource; version_group: NamedAPIResource }[];
  attributes: NamedAPIResource[];
}

export interface Generation {
  id: number;
  name: string;
  pokemon_species: NamedAPIResource[];
}

export interface VersionGroup {
  id: number;
  name: string;
  generation: NamedAPIResource;
}

export interface NamedAPIResourceList {
  count: number;
  next: string | null;
  previous: string | null;
  results: NamedAPIResource[];
}
