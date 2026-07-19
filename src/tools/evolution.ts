import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getResource } from "../pokeapi-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { idFromUrl } from "../utils.js";
import type { ChainLink, EvolutionChain, EvolutionDetail, PokemonSpecies } from "../types.js";

function describeEvolutionDetail(detail: EvolutionDetail): string {
  const parts: string[] = [];
  switch (detail.trigger.name) {
    case "level-up":
      parts.push(detail.min_level ? `sobe para o nível ${detail.min_level}` : "sobe de nível");
      break;
    case "trade":
      parts.push(detail.trade_species ? `é trocado por ${detail.trade_species.name}` : "é trocado");
      break;
    case "use-item":
      parts.push(detail.item ? `usa o item '${detail.item.name}'` : "usa um item");
      break;
    case "shed":
      parts.push("evolui deixando uma casca (Shedinja)");
      break;
    default:
      parts.push(`gatilho: ${detail.trigger.name}`);
  }
  if (detail.min_happiness) parts.push(`felicidade mínima ${detail.min_happiness}`);
  if (detail.min_beauty) parts.push(`beleza mínima ${detail.min_beauty}`);
  if (detail.min_affection) parts.push(`afeição mínima ${detail.min_affection}`);
  if (detail.held_item) parts.push(`segurando '${detail.held_item.name}'`);
  if (detail.known_move) parts.push(`conhecendo o move '${detail.known_move.name}'`);
  if (detail.known_move_type) parts.push(`conhecendo um move do tipo '${detail.known_move_type.name}'`);
  if (detail.location) parts.push(`no local '${detail.location.name}'`);
  if (detail.time_of_day) parts.push(`durante '${detail.time_of_day}'`);
  if (detail.party_species) parts.push(`com '${detail.party_species.name}' no time`);
  if (detail.party_type) parts.push(`com um Pokémon do tipo '${detail.party_type.name}' no time`);
  if (detail.needs_overworld_rain) parts.push("chovendo no mundo aberto");
  if (detail.turn_upside_down) parts.push("com o console de cabeça para baixo");
  if (detail.gender === 1) parts.push("apenas fêmea");
  if (detail.gender === 2) parts.push("apenas macho");
  return parts.join(", ");
}

async function buildNode(link: ChainLink): Promise<Record<string, unknown>> {
  const [species, children] = await Promise.all([
    getResource<PokemonSpecies>("pokemon-species", link.species.name),
    Promise.all(link.evolves_to.map(buildNode)),
  ]);

  return {
    species: link.species.name,
    is_baby: link.is_baby,
    evolution_conditions:
      link.evolution_details.length > 0 ? link.evolution_details.map(describeEvolutionDetail) : null,
    varieties: species.varieties.map((v) => ({ name: v.pokemon.name, is_default: v.is_default })),
    evolves_to: children,
  };
}

export function registerGetEvolutionChainTool(server: McpServer) {
  server.registerTool(
    "get_evolution_chain",
    {
      title: "Cadeia de evolução de um Pokémon",
      description:
        "Retorna a árvore completa de evolução de um Pokémon (a partir do estágio base até os finais), " +
        "com as condições legíveis de cada evolução (nível, item, troca, amizade, hora do dia, local, etc.) " +
        "e as variedades/formas (incluindo mega evolução, formas regionais e Gigantamax) disponíveis em cada estágio.",
      inputSchema: {
        name_or_id: z
          .string()
          .describe("Nome ou id de qualquer Pokémon da cadeia (não precisa ser o estágio base)."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const species = await getResource<PokemonSpecies>("pokemon-species", name_or_id);
        const chainId = idFromUrl(species.evolution_chain.url);
        const chain = await getResource<EvolutionChain>("evolution-chain", chainId);
        const tree = await buildNode(chain.chain);
        return jsonResult({ evolution_chain_id: chain.id, chain: tree });
      }),
  );
}
