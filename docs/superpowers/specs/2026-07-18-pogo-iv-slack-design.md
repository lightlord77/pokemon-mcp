# Design: `pogo-iv-slack` Skill

## Contexto

O usuário quer descobrir o IV de Pokémon do Pokémon GO postando screenshots num canal dedicado do Slack (`calculo-IV-PoGo`), sem precisar colar a imagem diretamente numa conversa com o Claude. A ideia inicial era criar uma nova tool no servidor `pokemon-mcp` que acessasse a API do Slack, baixasse a imagem, "analisasse" e postasse a resposta.

Durante o brainstorm ficou claro que essa não é uma tarefa de **tool** MCP (função determinística, sem julgamento) — é uma sequência de decisões orquestradas pelo assistente usando recursos que já existem:
- O conector Slack já conectado nesta conta (`mcp__claude_ai_Slack__*`)
- A tool `go_estimate_iv`, já existente no `pokemon-mcp`, que calcula o IV a partir de CP/HP/nível (não de imagem)
- A visão nativa do Claude, que já é o que lê os números da screenshot (não uma tool)
- O histórico do próprio canal do Slack como fonte de verdade para numerar as fotos sequencialmente — descartando a ideia de um contador persistido à parte

Por isso a solução é uma **Skill** (procedimento reutilizável), não uma tool nova. **Nenhuma mudança de código no servidor `pokemon-mcp` é necessária** — `go_estimate_iv` já cobre o cálculo.

## Objetivo

Uma Skill `pogo-iv-slack` que, quando invocada, processa toda imagem nova (ainda sem resposta) postada no canal `calculo-IV-PoGo`, calcula o IV via `go_estimate_iv`, e posta a resposta no formato:

```
#Foto N - Pokemon <Nome> - IV <valor>
```

onde `N` é a posição sequencial da foto em relação a todas as anteriores, e `<valor>` é a porcentagem de IV (ou uma faixa `min-max` quando o resultado for ambíguo).

## Não-objetivos

- Não cria nenhuma tool nova no `pokemon-mcp`.
- Não introduz nenhum arquivo de estado/contador persistido — a numeração é derivada do próprio histórico do canal.
- Não reage automaticamente/em tempo real a novas mensagens (sem webhook) — a Skill roda quando invocada numa conversa, conforme decidido anteriormente na sessão (fluxo "sob demanda").
- Não lida com canais além de `calculo-IV-PoGo` nesta primeira versão.

## Arquitetura

```
Usuário posta screenshot(s) no #calculo-IV-PoGo
                    │
        (mais tarde, em qualquer conversa)
                    │
        Usuário invoca a Skill pogo-iv-slack
                    │
                    ▼
    ┌───────────────────────────────────┐
    │ 1. slack_read_channel              │  → histórico recente do canal
    │ 2. Parse da última msg "#Foto N"    │  → N atual (0 se não houver)
    │ 3. Lista imagens após essa msg      │  → 0, 1 ou N imagens pendentes
    │    (ordem cronológica)              │
    └───────────────────────────────────┘
                    │
        para cada imagem pendente, em ordem:
                    ▼
    ┌───────────────────────────────────┐
    │ 4. slack_read_file (baixa imagem)   │
    │ 5. Leitura via visão nativa         │  → CP, HP, stardust cost, espécie
    │ 6. go_estimate_iv (tool existente)  │  → combinações de IV
    │ 7. Formata "#Foto {N+1} - ..."      │
    │ 8. slack_send_message               │  → posta no canal
    │ 9. N += 1, próxima imagem           │
    └───────────────────────────────────┘
```

## Componentes

- **Slack MCP connector** (`mcp__claude_ai_Slack__*`, já conectado): `slack_search_channels` (resolver o ID do canal pelo nome), `slack_read_channel` (histórico), `slack_read_file` (baixar imagem), `slack_send_message` (postar resposta).
- **`go_estimate_iv`** (tool existente em `pokemon-mcp`, sem alterações): recebe `name_or_id`, `cp`, `hp`, e opcionalmente `level`/`stardust_cost`; retorna as combinações de IV compatíveis.
- **Visão nativa do Claude**: lê a imagem baixada do Slack para extrair CP, HP, custo de stardust (se visível) e o nome do Pokémon — mesmo papel que já exerce quando o usuário cola uma imagem direto no chat.

## Fluxo de dados (detalhado)

1. Resolver o ID do canal `calculo-IV-PoGo` (via `slack_search_channels`, cacheável na memória da conversa).
2. `slack_read_channel` no canal, com histórico suficiente para cobrir desde a última resposta da Skill (paginar com `cursor` se necessário — canal dedicado deve manter isso pequeno).
3. Percorrer as mensagens do mais recente para o mais antigo até achar a mensagem mais recente cujo texto bate com o regex `^#Foto (\d+) - Pokemon`. Extrair `N`. Se nenhuma mensagem bater, `N = 0`.

   > **Nota:** o conector do Slack posta usando a sua própria conta (não existe uma identidade de "bot" separada nesta integração), então não dá pra filtrar "minhas mensagens" por autor — a identificação é só por conteúdo (o padrão `#Foto N - Pokemon`). Isso é suficiente desde que nenhuma outra mensagem no canal use esse mesmo padrão por coincidência.
4. Coletar todas as mensagens com arquivo de imagem anexado que vieram **depois** dessa última resposta (por timestamp), em ordem cronológica crescente.
5. Se a lista estiver vazia, informar ao usuário que não há imagem pendente e parar.
6. Para cada imagem, em ordem:
   a. Baixar via `slack_read_file`.
   b. Ler via visão: identificar CP, HP, custo de stardust do Power Up (se visível) e a espécie do Pokémon.
   c. Chamar `go_estimate_iv` com esses valores.
   d. Determinar o valor de IV a postar (ver regra de ambiguidade abaixo).
   e. Postar `#Foto {N+1} - Pokemon {Nome} - IV {valor}` via `slack_send_message`.
   f. `N = N + 1`.

### Regra de ambiguidade do IV

- Se `go_estimate_iv` retornar exatamente 1 combinação (nível/stardust foram informados e resolveram um único match): postar o `iv_percent` exato.
- Se retornar múltiplas combinações: postar a faixa `min%-max%` entre os `iv_percent` de todos os matches retornados.
- Se retornar zero combinações (números inconsistentes) ou a extração via visão falhar: **não postar um número** — postar uma mensagem de erro clara para aquela foto específica (ex: `#Foto {N+1} - Pokemon {Nome} - não foi possível calcular o IV (motivo)`) e ainda assim incrementar `N`, já que a foto ocupa uma posição na sequência.

## Tratamento de casos de borda

| Caso | Comportamento |
|---|---|
| Primeira foto do canal (nenhuma resposta anterior) | `N` inicial = 0, primeira foto processada vira `#Foto 1` |
| Várias imagens acumuladas numa única execução | Processadas em ordem cronológica, uma resposta por imagem, `N` incrementado a cada uma |
| Imagem não é uma screenshot válida do Pokémon GO | Pula o cálculo, posta aviso de que a imagem não pôde ser processada, ainda incrementa `N` |
| CP/HP ilegíveis | Mesmo tratamento acima |
| Nível/stardust ilegível mas CP/HP ok | Resultado ambíguo → posta faixa (ver regra acima) |
| Nenhuma mensagem no histórico bate com o regex esperado (primeira vez, ou mensagem anterior editada/deletada) | Trata como se não houvesse mensagem anterior (`N = 0`) — reinicia a contagem de forma explícita, sem travar |

## Verificação

Sem código novo, a verificação é funcional, direto no Slack:
1. Postar uma imagem de teste no `#calculo-IV-PoGo` (CP/HP legíveis) → invocar a Skill → confirmar que a resposta sai como `#Foto 1 - Pokemon X - IV Y`.
2. Postar uma segunda imagem → invocar de novo → confirmar `#Foto 2 - ...` (parsing correto da mensagem anterior).
3. Postar duas imagens de uma vez antes de invocar → confirmar que ambas são processadas em ordem, gerando `#Foto 3` e `#Foto 4` na mesma execução.
4. Postar uma imagem com CP/HP legíveis mas sem o custo de stardust visível → confirmar que a resposta vem como faixa (`IV min-max`).
5. Postar uma imagem irrelevante (não é screenshot do jogo) → confirmar que a Skill reporta o problema em vez de inventar um número.
