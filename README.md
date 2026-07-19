# pokemon-mcp

Servidor MCP (Model Context Protocol) que expõe dados ricos de Pokémon — stats, tipos, abilities, sprites/imagens, formas/transformações (mega evolução, formas regionais, Gigantamax), cadeias de evolução, moves/ataques, itens e efetividade de tipos — usando a [PokéAPI](https://pokeapi.co/docs/v2) como fonte. Também expõe dados específicos do **Pokémon GO** (stats/CP, movesets de raid e PvP, evolução por candy/item/distância, raid bosses e Community Days) via a [PoGo API](https://pogoapi.net/documentation/).

## Tools disponíveis — jogos principais (PokéAPI)

| Tool | O que retorna |
|---|---|
| `get_pokemon` | Perfil completo: stats base, tipos, abilities, todos os sprites (artwork oficial, Home, Showdown animado, Dream World), descrição da Pokédex, capture rate, growth rate, egg groups, geração, formas/varieties disponíveis |
| `get_evolution_chain` | Árvore completa de evolução com condições legíveis (nível, item, troca, amizade, hora do dia, etc.) e varieties/mega/gmax de cada estágio |
| `get_pokemon_moves` | Moves aprendíveis por um Pokémon, agrupados por método (level-up com nível, TM, egg, tutor) |
| `get_move` | Detalhe completo de um ataque: poder, precisão, PP, tipo, efeito, meta de batalha (ailment, crit rate, drain, flinch, etc.) |
| `get_ability` | Efeito completo de uma ability e quais Pokémon podem tê-la |
| `get_type` | Tabela de efetividade de dano (ofensiva/defensiva) de um tipo |
| `get_item` | Detalhe de um item (evolução, held item, berry, etc.) |
| `search_pokemon` | Busca/filtra Pokémon por nome, tipo e/ou geração |

## Tools disponíveis — Pokémon GO (PoGo API)

| Tool | O que retorna |
|---|---|
| `go_get_pokemon` | Stats GO (attack/defense/stamina), tipos, raridade, se já foi lançado, disponibilidade de shiny, CP máximo, distância de buddy, formas mega; opcionalmente calcula o CP real para um nível e IVs específicos |
| `go_get_pokemon_moves` | Moveset atual (fast + charged, incluindo Elite TM/legacy) com stats completos de raid/PvE e de PvP para cada move |
| `go_get_move` | Detalhe de um move específico nos dois contextos (raid e PvP) |
| `go_get_evolution` | Árvore de evolução com regras do GO: candy, item, lure module, distância como buddy, restrição de dia/noite |
| `go_get_raid_bosses` | Raid bosses atuais (ou anteriores) por tier, com faixas de CP e clima de boost |
| `go_get_community_days` | Histórico de Community Days, filtrável por Pokémon |
| `go_estimate_iv` | Calcula quais combinações de IV (Attack/Defense/Stamina) são compatíveis com o CP e HP observados — mesmo método usado por PokeGenie/GoIV/Calcy IV. Uso típico: cole no chat um print da tela de detalhes do Pokémon (CP, HP e custo de stardust do Power Up); o Claude lê os números via visão e chama a tool. **Não** use a tela de apreciação com as 3 barras — ela só dá uma faixa aproximada por stat, não o valor exato. **Limitação:** só cobre níveis 1–45 (a fonte de dados não tem os multiplicadores de CP acima disso; Pokémon nível 45.5+ de Master League com XL candy/Best Buddy não podem ser calculados) |

## Instalação e build

```bash
npm install
npm run build
```

Isso gera `dist/index.js`, o entrypoint do servidor (transporte stdio).

## Testar manualmente

Com o [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npm run inspector
```

Abre uma UI local onde você pode chamar cada tool interativamente e ver o JSON de resposta.

## Registrar no Claude Code

```bash
claude mcp add pokemon -- node /Users/gfontes/Documents/projects/pokemon/dist/index.js
```

## Registrar no Claude Desktop

Edite `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) e adicione:

```json
{
  "mcpServers": {
    "pokemon": {
      "command": "node",
      "args": ["/Users/gfontes/Documents/projects/pokemon/dist/index.js"]
    }
  }
}
```

Reinicie o Claude Desktop para as tools aparecerem.

## Notas

- Sem autenticação necessária — tanto a PokéAPI quanto a PoGo API são públicas e gratuitas.
- Respostas são cacheadas em memória (10 min para a PokéAPI, 15 min para a PoGo API), respeitando a política de fair-use da PokéAPI de evitar chamadas repetidas.
- Nomes/ids inválidos retornam um erro de tool amigável em vez de derrubar o processo.
- Os dados do Pokémon GO usam form `"Normal"` por padrão ao mesclar informações (a PoGo API tem ~270 variações de forma incluindo fantasias/eventos); formas regionais/mega são sinalizadas separadamente nos campos relevantes.
