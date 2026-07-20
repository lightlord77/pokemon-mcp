import { getResource } from "./pokeapi-client.js";
import { idFromUrl, pickAllSprites, pickFlavorText } from "./utils.js";
import type { Pokemon, PokemonSpecies } from "./types.js";

export interface PokemonProfile {
  id: number;
  name: string;
  height_decimeters: number;
  weight_hectograms: number;
  base_experience: number | null;
  types: string[];
  abilities: { name: string; is_hidden: boolean }[];
  base_stats: Record<string, number>;
  sprites: ReturnType<typeof pickAllSprites>;
  held_items: string[];
  pokedex_description: string | null;
  capture_rate: number;
  base_happiness: number | null;
  growth_rate: string;
  egg_groups: string[];
  gender_rate_eighths_female: number;
  has_gender_differences: boolean;
  generation: string;
  color: string;
  habitat: string | null;
  is_baby: boolean;
  is_legendary: boolean;
  is_mythical: boolean;
  evolves_from: string | null;
  evolution_chain_id: number;
  varieties: { name: string; is_default: boolean }[];
}

/** Builds the full Pokémon profile (stats, sprites, species data) shared by get_pokemon and pokedex_view. */
export async function buildPokemonProfile(nameOrId: string): Promise<PokemonProfile> {
  const pokemon = await getResource<Pokemon>("pokemon", nameOrId);
  const species = await getResource<PokemonSpecies>("pokemon-species", pokemon.species.name);

  return {
    id: pokemon.id,
    name: pokemon.name,
    height_decimeters: pokemon.height,
    weight_hectograms: pokemon.weight,
    base_experience: pokemon.base_experience,
    types: pokemon.types.map((t) => t.type.name),
    abilities: pokemon.abilities.map((a) => ({
      name: a.ability.name,
      is_hidden: a.is_hidden,
    })),
    base_stats: Object.fromEntries(pokemon.stats.map((s) => [s.stat.name, s.base_stat])),
    sprites: pickAllSprites(pokemon.sprites),
    held_items: pokemon.held_items.map((h) => h.item.name),
    pokedex_description: pickFlavorText(species.flavor_text_entries),
    capture_rate: species.capture_rate,
    base_happiness: species.base_happiness,
    growth_rate: species.growth_rate.name,
    egg_groups: species.egg_groups.map((g) => g.name),
    gender_rate_eighths_female: species.gender_rate,
    has_gender_differences: species.has_gender_differences,
    generation: species.generation.name,
    color: species.color.name,
    habitat: species.habitat?.name ?? null,
    is_baby: species.is_baby,
    is_legendary: species.is_legendary,
    is_mythical: species.is_mythical,
    evolves_from: species.evolves_from_species?.name ?? null,
    evolution_chain_id: idFromUrl(species.evolution_chain.url),
    varieties: species.varieties.map((v) => ({
      name: v.pokemon.name,
      is_default: v.is_default,
    })),
  };
}
