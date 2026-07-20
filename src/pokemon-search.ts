import { getFullList, getResource } from "./pokeapi-client.js";
import type { Generation, NamedAPIResourceList, PokemonType } from "./types.js";

export interface PokemonSearchFilters {
  query?: string;
  type?: string;
  generation?: string;
}

/** Returns every Pokémon name matching all given filters (intersection), sorted alphabetically, unlimited. */
export async function findMatchingNames({ query, type, generation }: PokemonSearchFilters): Promise<string[]> {
  const candidateSets: Set<string>[] = [];

  if (type) {
    const typeData = await getResource<PokemonType>("type", type);
    candidateSets.push(new Set(typeData.pokemon.map((p) => p.pokemon.name)));
  }

  if (generation) {
    const genData = await getResource<Generation>("generation", generation);
    candidateSets.push(new Set(genData.pokemon_species.map((s) => s.name)));
  }

  if (query) {
    const list = await getFullList<NamedAPIResourceList>("pokemon");
    const needle = query.trim().toLowerCase();
    candidateSets.push(new Set(list.results.filter((r) => r.name.includes(needle)).map((r) => r.name)));
  }

  let names: string[];
  if (candidateSets.length === 0) {
    const list = await getFullList<NamedAPIResourceList>("pokemon");
    names = list.results.map((r) => r.name);
  } else {
    names = [...candidateSets.reduce((a, b) => new Set([...a].filter((x) => b.has(x))))];
  }

  names.sort();
  return names;
}
