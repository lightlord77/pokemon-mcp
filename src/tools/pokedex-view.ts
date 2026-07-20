// src/tools/pokedex-view.ts
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildPokemonProfile, type PokemonProfile } from "../pokemon-profile.js";
import { runTool } from "../tool-helpers.js";
import { POKEDEX_RESOURCE_URI } from "./pokedex-ui.js";

function pokemonProfileSprite(profile: PokemonProfile): string | null {
  return profile.sprites.official_artwork ?? profile.sprites.front_default;
}

export function registerPokedexViewTool(server: McpServer) {
  registerAppTool(
    server,
    "pokedex_view",
    {
      title: "Card de detalhe de um Pokémon (com UI)",
      description:
        "Retorna o perfil de um Pokémon (stats, tipos, abilities, sprite, descrição) e mostra num card " +
        "visual com stats em barra. Equivalente visual de get_pokemon — chamável direto (ex: 'mostra o " +
        "card do Pikachu') ou a partir de um clique em pokedex_search.",
      inputSchema: {
        name_or_id: z.string().describe("Nome (ex: 'pikachu', 'mr-mime') ou id numérico do Pokémon."),
      },
      outputSchema: {
        pokemon: z.object({
          id: z.number(),
          name: z.string(),
          sprite: z.string().nullable(),
          height_decimeters: z.number(),
          weight_hectograms: z.number(),
          types: z.array(z.string()),
          abilities: z.array(z.object({ name: z.string(), is_hidden: z.boolean() })),
          base_stats: z.record(z.string(), z.number()),
          pokedex_description: z.string().nullable(),
          is_legendary: z.boolean(),
          is_mythical: z.boolean(),
          evolves_from: z.string().nullable(),
        }),
      },
      _meta: { ui: { resourceUri: POKEDEX_RESOURCE_URI } },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const profile = await buildPokemonProfile(name_or_id);
        const pokemon = {
          id: profile.id,
          name: profile.name,
          sprite: pokemonProfileSprite(profile),
          height_decimeters: profile.height_decimeters,
          weight_hectograms: profile.weight_hectograms,
          types: profile.types,
          abilities: profile.abilities,
          base_stats: profile.base_stats,
          pokedex_description: profile.pokedex_description,
          is_legendary: profile.is_legendary,
          is_mythical: profile.is_mythical,
          evolves_from: profile.evolves_from,
        };

        return {
          content: [{ type: "text" as const, text: `Perfil de ${pokemon.name} (#${pokemon.id}).` }],
          structuredContent: { pokemon },
        };
      }),
  );
}
