# pokemon-mcp

Servidor MCP (Model Context Protocol) que expõe dados da PokéAPI (jogos principais) e da PoGo API (Pokémon GO) como tools. Ver `README.md` pra lista de tools e instalação, e `docs/` pra referência de endpoints e propostas de tools novas.

## Agentes disponíveis

### brok

Agente de projeto (`.claude/agents/brok.md`) — game designer sênior com conhecimento profundo de desenvolvimento de jogos em geral e especialista obsessivo em mecânicas do Pokémon GO (CP, IV, CPM, fast/charged moves, efetividade de tipo própria do GO, raids, PvP, evolução por candy, Community Days, Shadow/Purified, formas regionais, mega evolução). Ele só lê e revisa — **nunca escreve nem edita arquivos**.

**Quando invocar o Brok** (via Agent tool, `subagent_type: "brok"`):
- Depois de escrever ou atualizar qualquer spec, doc ou proposta de tool que descreva mecânicas do Pokémon GO, antes de considerar o conteúdo final.
- Sempre que uma composição de tools misturar dados da PokéAPI com dados da PoGo API — o Brok é quem garante que a regra "nunca usar número de jogo principal (power/PP de move, efetividade de tipo por geração) pra calcular ou representar algo do GO" foi respeitada.
- Quando uma tabela ou lista que se declara exaustiva (ex: "todos os N endpoints", "todas as tools existentes") precisa ser conferida linha a linha contra o código-fonte real, não contra a intenção documentada.

**Prioridade do Brok, sempre nessa ordem:** (1) precisão de mecânica de jogo — isso é sempre bloqueador se estiver errado, independente do resto estar bem organizado; (2) organização — consistência interna, nomenclatura, tabelas realmente completas.

**Saída esperada:** um relatório estruturado (Bloqueadores / Organizacional / Notas / Veredito: Aprovado, Aprovado com ressalvas, ou Bloqueado). Trate um veredito "Bloqueado" ou "Aprovado com ressalvas" como não-final — aplique as correções apontadas e reenvie pro Brok até ele aprovar sem ressalvas antes de reportar o resultado como concluído.
