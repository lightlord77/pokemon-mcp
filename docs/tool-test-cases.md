# Casos de uso para testar as tools

Como testar: `npm run build && npm run inspector` (abre o MCP Inspector, onde dá pra chamar cada tool com os parâmetros abaixo e ver o JSON de resposta), ou registrado no Claude Desktop/Code, pedindo em linguagem natural o equivalente a cada exemplo.

Dados do Pokémon GO (CP, raridade, raid bosses, Community Days, shinies por tempo limitado) mudam com o tempo — se um resultado divergir do que está aqui, é o jogo tendo mudado desde 2026-07-18, não necessariamente um bug.

---

## Parte 1 — Tools existentes (testáveis agora)

### PokéAPI

**`get_pokemon`**
- Caso de uso: perfil completo de um Pokémon comum.
  `{ "name_or_id": "charizard" }` — confira `types: ["fire", "flying"]`, sprites preenchidos, `evolution_chain_id` presente.
- Caso de borda: nome com hífen.
  `{ "name_or_id": "mr-mime" }` — confira que resolve sem erro.
- Caso de erro esperado: nome inválido.
  `{ "name_or_id": "pokemonzao-inventado" }` — deve devolver erro amigável (`PokeApiNotFoundError`), não derrubar o processo.

**`get_evolution_chain`**
- Caso de uso: árvore com múltiplas ramificações.
  `{ "name_or_id": "eevee" }` — confira as 8 evoluções (Vaporeon, Jolteon, Flareon, Espeon, Umbreon, Leafeon, Glaceon, Sylveon) e que cada `evolution_conditions` é legível (ex: "felicidade mínima 220, durante 'day'" pro Espeon).
- Caso de uso: chamar a partir de um estágio não-base.
  `{ "name_or_id": "charizard" }` — deve devolver a mesma árvore que `{ "name_or_id": "charmander" }`.

**`get_pokemon_moves`**
- Caso de uso: moveset padrão (version_group mais recente).
  `{ "name_or_id": "pikachu" }` — confira `version_group_used` resolvido automaticamente.
- Caso de uso: filtrar por método.
  `{ "name_or_id": "pikachu", "method": "egg" }` — só retorna `egg`, os outros arrays vazios.
- Caso de uso: comparar entre jogos.
  `{ "name_or_id": "pikachu", "version_group": "red-blue" }` vs sem parâmetro — os níveis de level-up devem diferir.

**`get_move`**
- Caso de uso: move de dano comum.
  `{ "name_or_id": "thunderbolt" }` — confira `power: 90`, `type: "electric"`, `damage_class: "special"`.
- Caso de uso: move de status (sem power).
  `{ "name_or_id": "toxic" }` — confira `power: null` e `meta.ailment` preenchido.

**`get_ability`**
- Caso de uso: ability comum a várias espécies.
  `{ "name_or_id": "intimidate" }` — confira lista longa em `pokemon_with_this_ability`.
- Caso de uso: hidden ability.
  `{ "name_or_id": "levitate" }` — confira que `is_hidden: true` aparece pra algum Pokémon da lista.

**`get_type`**
- Caso de uso: efetividade ofensiva/defensiva.
  `{ "name_or_id": "dragon" }` — confira `offensive.no_damage_to` incluindo `"fairy"` (imunidade real dos jogos principais — diferente do GO, que não tem essa categoria).
- Caso de uso: tipo com muitas resistências.
  `{ "name_or_id": "steel" }` — confira `defensive.half_damage_from` com uma lista longa.

**`get_item`**
- Caso de uso: item de evolução.
  `{ "name_or_id": "thunder-stone" }` — confira `category` e `effect` mencionando evolução.
- Caso de uso: held item competitivo.
  `{ "name_or_id": "leftovers" }` — confira `effect` mencionando cura por turno.

**`search_pokemon`**
- Caso de uso: busca simples por substring.
  `{ "query": "saur" }` — confira que retorna Bulbasaur, Ivysaur, Venusaur (e outros com "saur" no nome).
- Caso de uso: interseção de filtros.
  `{ "query": "saur", "type": "poison" }` — deve reduzir a lista anterior (Bulbasaur/Ivysaur/Venusaur são poison; espécies "saur" não-poison somem).
- Caso de uso: filtro por geração sozinho, com limite.
  `{ "generation": "generation-i", "limit": 5 }` — confira `returned: 5` e `total_matches: 151`.

### PoGo API

**`go_get_pokemon`**
- Caso de uso: perfil básico.
  `{ "name_or_id": "Tyranitar" }` — confira stats attack/defense/stamina, `mega_forms` presente (Tyranitar mega evolui).
- Caso de uso: cálculo de CP num nível específico.
  `{ "name_or_id": "Tyranitar", "level": 25, "attack_iv": 15, "defense_iv": 15, "stamina_iv": 15 }` — confira que o CP calculado bate com o que o jogo mostra pra um Tyranitar nível 25 com IVs perfeitos (~2136 CP, checar contra fonte externa se quiser validar).
- Caso de borda: Pokémon com forma regional.
  `{ "name_or_id": "Meowth" }` — confira `has_alolan_form: true`.

**`go_get_pokemon_moves`**
- Caso de uso: Pokémon com Elite TM move (legacy).
  `{ "name_or_id": "Machamp" }` — confira `elite_only_charged_moves` incluindo algo como "Cross Chop" ou "Stone Edge".
- Caso de uso: Pokémon simples sem elite moves.
  `{ "name_or_id": "Rattata" }` — confira `elite_only_fast_moves` e `elite_only_charged_moves` vazios.

**`go_get_move`**
- Caso de uso: move exclusivo de Community Day.
  `{ "name": "Frenzy Plant" }` — confira dados de PvE (`power`, `duration`) e PvP presentes.
- Caso de uso: move comum a muitas espécies.
  `{ "name": "Counter" }` — confira que resolve mesmo sendo um fast move muito usado.
- Caso de erro esperado: nome que não existe no GO.
  `{ "name": "Fissure" }` (move que só existe nos jogos principais) — deve devolver erro amigável.

**`go_get_evolution`**
- Caso de uso: evolução simples por candy.
  `{ "name_or_id": "Magikarp" }` — confira `condition` mencionando 400 candy pra Gyarados.
- Caso de uso: evolução com condição extra (item + distância/gênero).
  `{ "name_or_id": "Eevee" }` — confira Sylveon com condição de buddy/distância, e diferenças de gênero se aplicável a alguma ramificação.

**`go_get_raid_bosses`**
- Caso de uso: listar tier específico.
  `{ "tier": "5" }` — confira que só retorna lendários de Tier 5 atuais.
- Caso de uso: buscar por nome incluindo rotação anterior.
  `{ "name": "Rayquaza", "include_previous": true }` — confira `rotation: "current"` ou `"previous"` em cada resultado.

**`go_get_community_days`**
- Caso de uso: histórico de um Pokémon específico.
  `{ "pokemon": "Charmander" }` — confira que retorna pelo menos um evento com `event_moves` incluindo algo como "Blast Burn".
- Caso de uso: eventos mais recentes sem filtro.
  `{ "limit": 3 }` — confira 3 eventos ordenados do mais recente pro mais antigo.

**`go_estimate_iv`**
- Caso de uso: sem level nem stardust (resultado ambíguo esperado).
  `{ "name_or_id": "Pikachu", "cp": 300, "hp": 51 }` — confira `ambiguous_levels: true` e `note` presente, `matches` com várias combinações em níveis diferentes.
- Caso de uso: com stardust_cost pra restringir.
  Mesmo Pikachu, adicionando `"stardust_cost": 1000` — confira que `matches` fica bem mais curto (1-2 níveis candidatos).
- Caso de borda documentada: nível acima de 45.
  `{ "name_or_id": "Pikachu", "cp": 4000, "hp": 200, "level": 50 }` — deve devolver erro explicando que a fonte de dados só cobre nível 1-45 (não travar silenciosamente).

---

## Parte 2 — Tools propostas (ainda não implementadas)

🔧 Nenhuma tool desta seção existe no código hoje — vêm de [`pogo-tool-proposals.md`](./pogo-tool-proposals.md) (aprovado pelo Brok). Os casos de uso abaixo são cenários-alvo para guiar a implementação e servir de roteiro de teste assim que cada tool for construída.

### Novas (dados diretos)

**`go_get_regional_forms`**
- Cenário: listar todas as formas regionais disponíveis hoje, incluindo Hisui/Paldea (que `go_get_pokemon` não expõe além de um booleano Alola/Galar).
  Esperado: Voltorb aparecer com forma Hisuian, Tauros com variantes Paldeanas (Aqua/Blaze/Combat).

**`go_get_shadow_pokemon`**
- Cenário: lista completa e dedicada (hoje só existe um booleano por espécie em `go_get_pokemon`).
  Esperado: Larvitar (linha do Tyranitar, comum em Team GO Rocket) presente na lista.

**`go_get_mega_pokemon`**
- Cenário: custo de energia 1ª vez vs. recorrente, e bônus.
  `{ "name_or_id": "Charizard" }` — esperado: energia menor pra recorrente do que pra primeira mega evolução, e `general_attack_boost: 1.1` / `same_type_attack_boost: 1.3` refletidos no cálculo.

**`go_get_pokemon_sources`**
- Cenário: Pokémon com múltiplos canais de obtenção.
  `{ "name_or_id": "Larvitar" }` — esperado: aparecer em nest E em pesquisa de campo, se ambos válidos no momento.
- Cenário: Pokémon raid-exclusive puro.
  `{ "name_or_id": "Mewtwo" }` — esperado: só canal de raid listado (sem selvagem/nest).

**`go_get_type_effectiveness`**
- Cenário: confirmar que o GO não tem imunidade real (o erro que o Brok pegou na spec).
  `{ "attacking_type": "normal", "defending_type": "ghost" }` — esperado: multiplicador `0.390625` (dupla resistência), **nunca** `0`.

**`go_get_weather_boosts`**
- Cenário: clima ensolarado.
  `{ "weather": "sunny" }` — esperado: `["fire", "grass", "ground"]` boostados.

**`go_get_encounter_data`**
- Cenário: confirmar que a tool não promete taxa de captura/fuga (que vem placeholder `-1` na fonte).
  `{ "name_or_id": "Mewtwo" }` — esperado: resposta com `attack_probability`/`dodge_probability`/frequência de ação, e ausência de qualquer campo de "capture_rate" tratado como dado real.

**`go_get_powerup_cost`**
- Cenário: transição pra XL Candy.
  `{ "level_from": 39, "level_to": 40 }` — esperado: `xl_candy_to_upgrade` deixar de ser zero exatamente no nível 40.

**`go_get_trainer_progression`**
- Cenário: recompensa de um nível de treinador específico.
  `{ "level": 40 }` — esperado: XP acumulado necessário + recompensas de level up daquele nível.

**`go_get_battle_league_info`**
- Cenário: requisitos de um rank alto.
  `{ "rank": "Legend" }` — esperado: faixa de rating necessária e recompensas de fim de temporada.

**`go_get_raid_settings`**
- Cenário: confirmar que a tool não inventa timers de batalha.
  Sem parâmetros — esperado: `remote_damage_modifier` (fator único), limites de convite/participação, e cooldown de convite de amigo — sem nenhum campo de duração de raid/eclosão de ovo.

**`go_get_friendship_levels`**
- Cenário: tier mais alto.
  Sem parâmetros — esperado: "Best Friends" com `friendship_points_required` e `xp_reward` como campos separados.

**`go_get_shiny_events`**
- Cenário: shiny disponível só durante um evento passado.
  `{ "pokemon": "Delibird" }` — esperado: janela de datas do evento em que o shiny esteve disponível.

### Compostas (chamam outras tools)

**`go_raid_counter_guide`**
- Cenário: melhores counters pro tier atual.
  `{ "tier": "5" }` — esperado: lista ranqueada de contra-ataques com moveset recomendado pro(s) boss(es) de Tier 5 atual(is).

**`go_community_day_prep`**
- Cenário: briefing do CD atual/próximo.
  Sem parâmetros — esperado: resumo dizendo se vale evoluir na hora e se o move exclusivo compensa aprender.

**`go_evolution_planner`**
- Cenário: comparação pré/pós evolução.
  `{ "name_or_id": "Rhyhorn" }` — esperado: stats e tipo do Rhyhorn vs. Rhydon vs. Rhyperior lado a lado, com requisito de candy/item de cada salto.

**`go_pvp_matchup_analyzer`**
- Cenário: matchup clássico de Great League.
  `{ "pokemon_a": "Azumarill", "pokemon_b": "Skarmory", "league": "great" }` — esperado: rating de vantagem considerando pressão de fast move e efetividade de tipo (GO, não PokéAPI).

**`go_mega_raid_planner`**
- Cenário: avaliar se vale mega evoluir pra uma mega raid.
  `{ "boss": "Mega Gyarados" }` — esperado: contra-ataques recomendados + se compensa gastar energia mega agora.

**`go_shadow_purify_advisor`**
- Cenário: decisão de purificar.
  `{ "name_or_id": "Shadow Mewtwo" }` — esperado: trade-off entre manter Frustration (fraco, imposto) vs. ganhar Return (forte) ao purificar — Return/Frustration injetados explicitamente, não vindos de `current_pokemon_moves`.

**`go_iv_and_moveset_report`**
- Cenário: relatório combinado pra um Pokémon recém-capturado.
  `{ "name_or_id": "Azumarill", "cp": 1500, "hp": 155 }` — esperado: % de IV estimado + qualidade do moveset atual de PvP + sugestão de melhor liga (Great/Ultra/Master).

**`go_regional_dex_completion_helper`**
- Cenário: fechar a dex com Pokémon regionais faltando.
  `{ "missing": ["Heatmor", "Durant", "Zangoose", "Seviper"] }` — esperado: por Pokémon, o canal de obtenção mais viável agora (troca regional, viagem, evento).
