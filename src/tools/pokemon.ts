import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getResource } from "../pokeapi-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { idFromUrl, pickAllSprites, pickFlavorText } from "../utils.js";
import type { Pokemon, PokemonSpecies } from "../types.js";

export function registerGetPokemonTool(server: McpServer) {
  server.registerTool(
    "get_pokemon",
    {
      title: "Perfil completo de um Pokémon",
      description:
        "Retorna o perfil completo de um Pokémon: stats base, tipos, abilities, todos os sprites/imagens " +
        "(artwork oficial, Pokémon Home, GIFs animados do Showdown, Dream World), descrição da Pokédex, " +
        "taxa de captura, felicidade base, growth rate, egg groups, geração, status lendário/mítico, " +
        "formas/variedades disponíveis e o id da cadeia de evolução (use get_evolution_chain para os detalhes).",
      inputSchema: {
        name_or_id: z
          .string()
          .describe("Nome (ex: 'pikachu', 'mr-mime') ou id numérico do Pokémon."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const pokemon = await getResource<Pokemon>("pokemon", name_or_id);
        const species = await getResource<PokemonSpecies>("pokemon-species", pokemon.species.name);

        const result = {
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

        return jsonResult(result);
      }),
  );
}
