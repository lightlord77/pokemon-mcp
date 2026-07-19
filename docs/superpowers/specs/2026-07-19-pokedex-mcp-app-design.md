# Design: MCP App `pokedex` (busca + card visual)

## Contexto

O `pokemon-mcp` hoje só expõe tools de dados (JSON/texto) — nenhuma delas retorna interface visual. Este design adiciona o primeiro **MCP App** do projeto: duas tools novas (`pokedex_search`, `pokedex_view`) que, além de dados, apontam pra uma UI HTML interativa (`ui://` resource) renderizada pelo host, mostrando sprite, tipos, stats em barra e navegação clicável entre busca e detalhe.

Escopo: só dados de jogos principais (PokéAPI), via as tools novas — `get_pokemon` e `search_pokemon` (PokéAPI, já existentes) não são alteradas nem ganham UI, permanecendo como respostas só-texto para quando o usuário só quer uma resposta rápida. Nenhuma mecânica de Pokémon GO está envolvida nesta trilha, então o agente Brok (especialista em GO) não precisou ser consultado; se uma versão futura desta UI incorporar dados do GO, ele deve revisar antes de finalizar.

Pesquisa de viabilidade técnica feita com o agente Liad Yosef (especialista em MCP Apps) confirmou:
- `@modelcontextprotocol/ext-apps@1.7.4` declara peer dependency `@modelcontextprotocol/sdk: ^1.29.0` — compatível com a versão já usada no projeto, sem necessidade de upgrade.
- `react`/`react-dom` são peer deps opcionais — dá pra usar `App`/`useApp` com JS puro, sem framework.
- Multiple tools podem apontar pro mesmo `_meta.ui.resourceUri` (padrão oficial documentado) — e é a abordagem correta aqui, porque `app.callServerTool()` chamado de dentro da UI **não troca o resource renderizado pelo host**, só devolve o `CallToolResult` pro JS já em execução no iframe. Ou seja, resources separados por tool quebrariam a navegação busca→detalhe.
- Sprites vêm de `raw.githubusercontent.com` (confirmado em `src/utils.ts::pickAllSprites`, que repassa as URLs originais da PokéAPI sem transformação) — único domínio a liberar em `_meta.ui.csp.resourceDomains`.

## Objetivo

Duas tools novas com UI compartilhada:
- `pokedex_search`: busca por nome/tipo/geração, retorna lista enxuta `{id, name, sprite, types}` por resultado; a UI renderiza como grid clicável.
- `pokedex_view`: perfil completo de um Pokémon (sprite oficial, tipos, stats em barra, abilities, evolução); a UI renderiza como card de detalhe.

Ambas continuam chamáveis diretamente pelo modelo (não só através da UI) — ex: "mostra o card do Pikachu" chama `pokedex_view` direto, abrindo já em modo card.

## Não-objetivos

- Não altera `get_pokemon` nem `search_pokemon` (PokéAPI, já existentes) — permanecem só-dados, sem UI.
- Não envolve nenhum dado ou mecânica do Pokémon GO (PoGo API) nesta primeira versão.
- Não introduz framework de UI (React/Vue/etc.) — vanilla JS/HTML/CSS.
- Não faz proxy de imagens pelo servidor MCP — sprites carregam direto de `raw.githubusercontent.com` via CSP allow-list.

## Arquitetura

```
Modelo/usuário chama pokedex_search("char")
                    │
                    ▼
    ┌─────────────────────────────────────────┐
    │ Tool pokedex_search roda (reaproveita a   │
    │ lógica de busca de search_pokemon)        │
    │ → retorna lista enxuta de resultados      │
    └─────────────────────────────────────────┘
                    │
                    ▼
    Host renderiza ui://pokedex/mcp-app.html
    UI recebe resultado via ontoolresult
    → desenha GRID (sprite + nome + badges de tipo)
                    │
        usuário clica num card do grid
                    │
                    ▼
    UI chama app.callServerTool({name: "pokedex_view", ...})
    (dentro do mesmo resource, sem re-render do host)
                    │
                    ▼
    ┌─────────────────────────────────────────┐
    │ Tool pokedex_view roda (reaproveita a     │
    │ lógica de get_pokemon)                    │
    │ → retorna perfil completo                 │
    └─────────────────────────────────────────┘
                    │
                    ▼
    UI recebe resposta do callServerTool diretamente
    → troca estado local pra CARD (stats em barra,
      tipos, abilities, evolução, sprite oficial)
```

Chamar `pokedex_view` diretamente (sem passar pela busca) segue o mesmo caminho a partir do terceiro bloco — a UI abre já em modo card.

## Componentes

```
src/tools/pokedex-search.ts   # registerPokedexSearchTool(server) — tool + _meta.ui.resourceUri
src/tools/pokedex-view.ts     # registerPokedexViewTool(server) — tool + _meta.ui.resourceUri
src/tools/pokedex-ui.ts       # registerAppResource único: ui://pokedex/mcp-app.html
src/ui/pokedex/mcp-app.html   # HTML de entrada da UI
src/ui/pokedex/src/mcp-app.ts # lógica: App bridge, estado grid/card, render, callServerTool
```

- **`pokedex-search.ts`** e **`pokedex-view.ts`**: seguem o padrão existente do repo (`registerXTool(server)`, Zod schema, `runTool`/`jsonResult` de `src/tool-helpers.ts`), reaproveitando as funções de busca/perfil já usadas por `search_pokemon`/`get_pokemon` — sem duplicar lógica de acesso à PokéAPI.
- **`pokedex-ui.ts`**: único responsável por `registerAppResource`, servindo o HTML bundlado (gerado por Vite) sob `ui://pokedex/mcp-app.html`. A URI é idêntica nos `_meta.ui.resourceUri` das duas tools e neste registro — literal compartilhada entre os três arquivos, nunca hardcoded três vezes.
- **`src/ui/pokedex/`**: fonte da UI, fora de `src/tools/` (que é só código de servidor). Build isolado via Vite + `vite-plugin-singlefile`, devDependency separada do `tsc` do servidor (`npm run build:ui`, não interfere em `npm run build`).

## Fluxo de dados (detalhado)

1. `pokedex_search({query, type?, generation?})` roda a mesma lógica de filtro de `search_pokemon`, mas mapeia cada resultado pro payload enxuto `{id, name, sprite, types}` (sprite = `front_default`, suficiente pro grid — o card de detalhe busca o sprite oficial separadamente via `pokedex_view`).
2. Host renderiza `ui://pokedex/mcp-app.html` na primeira chamada de qualquer uma das duas tools nesta conversa; `ontoolresult` entrega o payload pro bundle.
3. Bundle detecta o shape do resultado (`{results: [...]}` → modo grid; `{pokemon: {...}}` → modo card) e renderiza o modo correspondente.
4. Em modo grid: cada card mostra sprite + nome + badges de tipo; clique dispara `app.callServerTool({name: "pokedex_view", arguments: {name_or_id: id}})`.
5. `pokedex_view` reaproveita a lógica completa de `get_pokemon` (stats base, tipos, abilities, sprites — incluindo `official_artwork` —, cadeia de evolução) e devolve o mesmo `structuredContent`.
6. UI recebe a resposta do `callServerTool` diretamente no JS (sem o host re-renderizar o resource) e troca o estado local pra modo card.
7. Chamada direta de `pokedex_view` pelo modelo (sem busca prévia) segue os passos 2-3-6, pulando a etapa de grid.

## Tratamento de erros e casos de borda

| Caso | Comportamento |
|---|---|
| Busca sem resultados | `pokedex_search` retorna `{results: []}`; UI mostra estado vazio ("nenhum Pokémon encontrado para '{query}'") em vez de grid vazio silencioso |
| Nome/id inválido em `pokedex_view` | Tool lança erro amigável (padrão `runTool` já usado nas 15 tools existentes); UI mostra estado de erro no card, com opção de voltar ao grid anterior (se veio de uma busca) |
| Host sem suporte a MCP Apps | Ambas as tools continuam retornando `structuredContent`/`content` em texto legível (lista formatada / perfil formatado) — fallback nunca fica mudo |
| Sprite não carrega (URL quebrada da PokéAPI) | Tratado no CSS/HTML da UI com um placeholder simples — não é erro de tool, é detalhe de renderização |

## Verificação

Sem testes automatizados de UI nesta primeira versão (fora do escopo — nenhum framework de teste de UI está configurado no projeto). Verificação funcional:

1. `npm run build` (servidor, `tsc`) e `npm run build:ui` (bundle da UI, Vite) rodam sem erro.
2. Num host compatível com MCP Apps (MCP Inspector ou Claude Desktop): chamar `pokedex_search` com um termo que retorna múltiplos resultados (ex: "char") → grid renderiza com sprites carregando (valida `_meta.ui.csp.resourceDomains`); clicar num resultado → card abre sem o host recarregar visivelmente a UI (valida que a navegação usa `callServerTool` local, não um segundo resource).
3. Chamar `pokedex_view` diretamente com um nome válido (ex: "Pikachu") → abre direto em modo card.
4. Caso de erro: busca sem resultado (ex: "zzzzz") → estado vazio; `pokedex_view` com nome inválido → estado de erro.
5. Confirmar que `get_pokemon` e `search_pokemon` continuam respondendo só texto, sem UI — nenhuma regressão nas tools existentes.
