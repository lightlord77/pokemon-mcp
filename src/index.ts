#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerGetPokemonTool } from "./tools/pokemon.js";
import { registerGetEvolutionChainTool } from "./tools/evolution.js";
import { registerGetPokemonMovesTool, registerGetMoveTool } from "./tools/moves.js";
import { registerGetAbilityTool } from "./tools/abilities.js";
import { registerGetTypeTool } from "./tools/types.js";
import { registerGetItemTool } from "./tools/items.js";
import { registerSearchPokemonTool } from "./tools/search.js";
import { registerGoGetPokemonTool } from "./tools/go-pokemon.js";
import { registerGoGetPokemonMovesTool, registerGoGetMoveTool } from "./tools/go-moves.js";
import { registerGoGetEvolutionTool } from "./tools/go-evolution.js";
import { registerGoGetRaidBossesTool } from "./tools/go-raids.js";
import { registerGoGetCommunityDaysTool } from "./tools/go-community-days.js";
import { registerGoEstimateIvTool } from "./tools/go-iv.js";
import { registerPokedexUiResource } from "./tools/pokedex-ui.js";
import { registerPokedexSearchTool } from "./tools/pokedex-search.js";
import { registerPokedexViewTool } from "./tools/pokedex-view.js";

const server = new McpServer({
  name: "pokemon-mcp",
  version: "1.0.0",
});

registerGetPokemonTool(server);
registerGetEvolutionChainTool(server);
registerGetPokemonMovesTool(server);
registerGetMoveTool(server);
registerGetAbilityTool(server);
registerGetTypeTool(server);
registerGetItemTool(server);
registerSearchPokemonTool(server);

registerGoGetPokemonTool(server);
registerGoGetPokemonMovesTool(server);
registerGoGetMoveTool(server);
registerGoGetEvolutionTool(server);
registerGoGetRaidBossesTool(server);
registerGoGetCommunityDaysTool(server);
registerGoEstimateIvTool(server);

registerPokedexUiResource(server);
registerPokedexSearchTool(server);
registerPokedexViewTool(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("pokemon-mcp: servidor MCP rodando via stdio.");
}

main().catch((err) => {
  console.error("pokemon-mcp: erro fatal ao iniciar o servidor:", err);
  process.exit(1);
});
