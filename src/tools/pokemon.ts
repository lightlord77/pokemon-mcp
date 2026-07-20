import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { buildPokemonProfile } from "../pokemon-profile.js";

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
        const profile = await buildPokemonProfile(name_or_id);
        return jsonResult(profile);
      }),
  );
}
