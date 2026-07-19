# Propostas de tools — PoGo API

Análise dos 47 endpoints do PoGo API (`https://pogoapi.net/api/v1`, ver [`api-endpoints.md`](./api-endpoints.md)) com foco em: quais já viraram tool, quais tools novas fazem sentido pros que faltam, e quais tools **compostas** (que chamam outras tools do próprio servidor) dá pra construir em cima delas.

## Regra de mistura PokéAPI × PoGo API

Movesets e efetividade de tipo **não são os mesmos** entre Pokémon GO e os jogos de console:

- **Moves**: PoGo usa fast moves (ganham energy) e charged moves (custam energy), com poder/duração/cooldown próprios — não existe PP nem "power" no sentido do jogo principal. Alguns moves são exclusivos de um lado só (ex: moves de Community Day no GO).
- **Efetividade de tipo**: o GO usa multiplicadores próprios (super efetivo ×1.6, não muito efetivo ×0.625, empilhando multiplicativamente) e **não tem imunidade real** — o que nos jogos principais seria ×0 (imune) vira dupla resistência ×0.390625 (0.625²) no GO, então todo matchup causa algum dano. Isso é diferente da tabela ×2/×0.5/×0/×4/×0.25 do jogo principal — por isso o PoGo API tem seu próprio `type_effectiveness.json`.

**Consequência pro design:** tools do PokéAPI só entram em composições de GO para dados que são iguais nos dois jogos (arte/sprite oficial, descrição de espécie/lore, egg groups, formato da árvore de evolução). **Nunca** para números de combate (poder de move, multiplicador de tipo, PP) — esses sempre vêm do PoGo API.

---

## 1. Status atual dos 47 endpoints

Conferido linha a linha contra o código-fonte (`src/tools/*.ts`, `src/go-utils.ts`), não só contra a intenção documentada no README.

| Endpoint | Status | Tool |
|---|---|---|
| `pokemon_stats.json` | ✅ usado | `go_get_pokemon` / `go_estimate_iv` |
| `pokemon_types.json` | ✅ usado | `go_get_pokemon` |
| `pokemon_rarity.json` | ✅ usado | `go_get_pokemon` |
| `released_pokemon.json` | ✅ usado | `go_get_pokemon` |
| `shiny_pokemon.json` | ✅ usado | `go_get_pokemon` |
| `pokemon_max_cp.json` | ✅ usado | `go_get_pokemon` |
| `pokemon_buddy_distances.json` | ✅ usado | `go_get_pokemon` |
| `mega_pokemon.json` | ✅ usado (parcial) | `go_get_pokemon` (campo `mega_forms`) |
| `alolan_pokemon.json` | ✅ usado (parcial) | `go_get_pokemon` (campo `has_alolan_form`) |
| `galarian_pokemon.json` | ✅ usado (parcial) | `go_get_pokemon` (campo `has_galarian_form`) |
| `shadow_pokemon.json` | ✅ usado (parcial) | `go_get_pokemon` (campo `shadow_available`) |
| `current_pokemon_moves.json` | ✅ usado | `go_get_pokemon_moves` |
| `fast_moves.json` | ✅ usado | `go_get_pokemon_moves` / `go_get_move` |
| `charged_moves.json` | ✅ usado | `go_get_pokemon_moves` / `go_get_move` |
| `pvp_fast_moves.json` | ✅ usado | `go_get_pokemon_moves` / `go_get_move` |
| `pvp_charged_moves.json` | ✅ usado | `go_get_pokemon_moves` / `go_get_move` |
| `pokemon_evolutions.json` | ✅ usado | `go_get_evolution` |
| `raid_bosses.json` | ✅ usado | `go_get_raid_bosses` |
| `community_days.json` | ✅ usado | `go_get_community_days` |
| `cp_multiplier.json` | ✅ usado | `go_get_pokemon` (quando `level` é informado) / `go_estimate_iv` |
| `pokemon_powerup_requirements.json` | ✅ usado (parcial, interno) | `go_estimate_iv` (busca reversa stardust→nível; não exposto como tabela completa) |
| `pokemon_names.json` | ✅ usado (interno) | resolução de nome/id compartilhada por todas as tools GO (`go-utils.ts`) |
| `pokemon_forms.json` | ⬜ sem tool | → `go_get_regional_forms` (nova, expandida) |
| `pokemon_candy_to_evolve.json` | ⬜ sem tool | redundante — o candy já vem embutido em `pokemon_evolutions.json` (campo `candy_required`); não precisa de tool própria |
| `nesting_pokemon.json` | ⬜ sem tool | → `go_get_pokemon_sources` (nova) |
| `raid_exclusive_pokemon.json` | ⬜ sem tool | → `go_get_pokemon_sources` (nova) |
| `possible_ditto_pokemon.json` | ⬜ sem tool | → `go_get_pokemon_sources` (nova) |
| `pvp_exclusive_pokemon.json` | ⬜ sem tool | → `go_get_pokemon_sources` (nova) |
| `research_task_exclusive_pokemon.json` | ⬜ sem tool | → `go_get_pokemon_sources` (nova) |
| `baby_pokemon.json` | ⬜ sem tool | → `go_get_pokemon_sources` (nova) |
| `photobomb_exclusive_pokemon.json` | ⬜ sem tool | → `go_get_pokemon_sources` (nova) |
| `type_effectiveness.json` | ⬜ sem tool | → `go_get_type_effectiveness` (nova) |
| `weather_boosts.json` | ⬜ sem tool | → `go_get_weather_boosts` (nova) |
| `pokemon_encounter_data.json` | ⬜ sem tool | → `go_get_encounter_data` (nova) |
| `mega_evolution_settings.json` | ⬜ sem tool | → `go_get_mega_pokemon` (nova, complementa `mega_pokemon` já parcial) |
| `pokemon_powerup_requirements.json` (tabela completa) | ⬜ sem tool dedicada | → `go_get_powerup_cost` (nova) |
| `player_xp_requirements.json` | ⬜ sem tool | → `go_get_trainer_progression` (nova) |
| `levelup_rewards.json` | ⬜ sem tool | → `go_get_trainer_progression` (nova) |
| `badges.json` | ⬜ sem tool | → `go_get_trainer_progression` (nova) |
| `gobattle_league_rewards.json` | ⬜ sem tool | → `go_get_battle_league_info` (nova) |
| `gobattle_ranking_settings.json` | ⬜ sem tool | → `go_get_battle_league_info` (nova) |
| `raid_settings.json` | ⬜ sem tool | → `go_get_raid_settings` (nova) |
| `friendship_level_settings.json` | ⬜ sem tool | → `go_get_friendship_levels` (nova) |
| `time_limited_shiny_pokemon.json` | ⬜ sem tool | → `go_get_shiny_events` (nova) |
| `pokemon_genders.json` | ⬜ sem tool | campo extra em `go_get_pokemon`, sem tool própria |
| `pokemon_generations.json` | ⬜ sem tool | campo extra em `go_get_pokemon`, sem tool própria |
| `pokemon_height_weight_scale.json` | ⬜ sem tool | campo extra em `go_get_pokemon`, sem tool própria |
| `api_hashes.json` | ⬜ sem tool | infraestrutura de cache do próprio PoGo API, não é dado de jogo |

> Nota: `pokemon_powerup_requirements.json` aparece duas vezes de propósito — a linha "✅ usado (parcial, interno)" é o uso atual (só busca reversa dentro de `go_estimate_iv`), e a linha "⬜ sem tool dedicada" é a proposta de expor a tabela completa como retorno de primeira classe.

---

## 2. Tools novas propostas (dados diretos)

Seguindo o padrão já usado por `go_get_pokemon` (que hoje já combina **11 endpoints (12 quando `level` é informado)** numa resposta só, incluindo dados parciais de mega evolução, formas regionais e shadow), várias tools abaixo **complementam** dados que `go_get_pokemon` já expõe de forma resumida, em vez de partir do zero.

| Tool nova | Endpoints consumidos | O que retorna |
|---|---|---|
| `go_get_regional_forms` | `alolan_pokemon`, `galarian_pokemon`, `pokemon_forms` | Lista completa de variantes regionais disponíveis (Alola, Galar, e também Hisui/Paldea — que só existem como valores de `form` dentro de `pokemon_forms.json`, hoje não consumido em lugar nenhum); `go_get_pokemon` continua só sinalizando `has_alolan_form`/`has_galarian_form` como booleano |
| `go_get_shadow_pokemon` | `shadow_pokemon` | Lista completa e dedicada de Pokémon obteníveis via Team GO Rocket (hoje `go_get_pokemon` só expõe um booleano `shadow_available` por espécie) |
| `go_get_mega_pokemon` | `mega_pokemon` (já parcial em `go_get_pokemon`), `mega_evolution_settings` | Quais Pokémon mega evoluem, custo de energia (1ª vez vs. recorrente), bônus de batalha (boost geral 1.1×, boost de mesmo tipo 1.3×) |
| `go_get_pokemon_sources` | `nesting_pokemon`, `raid_exclusive_pokemon`, `possible_ditto_pokemon`, `pvp_exclusive_pokemon`, `research_task_exclusive_pokemon`, `baby_pokemon`, `photobomb_exclusive_pokemon` | Dado um Pokémon, todos os canais de obtenção exclusivos em que ele aparece (raid, pesquisa, nest, incubação, disfarce de Ditto, photobomb, recompensa de PvP) |
| `go_get_type_effectiveness` | `type_effectiveness` | Tabela de multiplicadores de dano por tipo **específica do GO** |
| `go_get_weather_boosts` | `weather_boosts` | Clima → tipos boostados |
| `go_get_encounter_data` | `pokemon_encounter_data` | Probabilidade de ataque/esquiva do Pokémon selvagem e frequência de ação durante o minigame de captura. **Não** promete taxa de captura/fuga (`base_capture_rate`/`base_flee_rate`) — esses dois campos vêm como placeholder `-1` na fonte atual para todas as espécies testadas |
| `go_get_powerup_cost` | `pokemon_powerup_requirements` | Tabela completa de custo por nível de power up — stardust, candy normal e **XL Candy** (moeda separada, relevante a partir do nível 40+) — exposta diretamente (hoje só existe busca reversa interna dentro de `go_estimate_iv`) |
| `go_get_trainer_progression` | `player_xp_requirements`, `levelup_rewards`, `badges` | Curva de XP por nível, recompensas de level up, marcos de badges |
| `go_get_battle_league_info` | `gobattle_league_rewards`, `gobattle_ranking_settings` | Tiers de rank, recompensas por rank/temporada |
| `go_get_raid_settings` | `raid_settings` | Mecânicas de raid: limites de convite/participação (presencial e remoto), nº máximo de jogadores, modificador de dano remoto vs. presencial (fator único — hoje `1.0`, **não** é uma tabela indexada por número de jogadores). O endpoint expõe cooldown/prazo de convite de amigo (`friend_invite_cooldown_duration`, `friend_invite_cutoff_time`), mas não timers de duração da batalha de raid nem de eclosão de ovo |
| `go_get_friendship_levels` | `friendship_level_settings` | Tiers de amizade por pontos de amizade necessários (`friendship_points_required`), bônus de troca/gym, e a recompensa de XP de treinador (`xp_reward`) concedida ao atingir cada tier |
| `go_get_shiny_events` | `time_limited_shiny_pokemon` | Shinies disponíveis só durante eventos, e a janela |

---

## 3. Tools compostas (chamam outras tools)

Estas não batem em nenhum endpoint diretamente — orquestram as tools acima (e, quando fizer sentido, tools da PokéAPI só para dados não-numéricos) para responder uma pergunta de tarefa completa.

1. **`go_raid_counter_guide`** — melhores counters prontos pro raid boss atual.
   `go_get_raid_bosses` → `go_get_pokemon` (tipo do boss) → `go_get_type_effectiveness` → `go_get_pokemon` (candidatos fortes contra esse tipo) → `go_get_pokemon_moves` (melhor moveset PvE de cada candidato).

2. **`go_community_day_prep`** — briefing do Community Day atual/próximo.
   `go_get_community_days` → `go_get_pokemon` (stats/shiny do Pokémon do CD) → `go_get_pokemon_moves` (move exclusivo vs. moveset padrão) → `go_get_evolution` (requisito pra evoluir dentro da janela do evento).

3. **`go_evolution_planner`** — vale evoluir esse Pokémon agora?
   `go_get_evolution` (árvore/requisitos) → `go_get_pokemon` (stats antes/depois de cada estágio) → `go_get_pokemon_moves` (moves ganhos na evolução).

4. **`go_pvp_matchup_analyzer`** — comparação simplificada de dois Pokémon em PvP.
   `go_get_pokemon` (x2) → `go_get_pokemon_moves` pvp (x2) → `go_get_type_effectiveness`. Não é simulador de batalha completo, é um rating de vantagem.

5. **`go_mega_raid_planner`** — vale mega evoluir pra essa raid?
   `go_get_raid_bosses` (mega raids atuais) → `go_get_mega_pokemon` (custo/bônus) → `go_get_pokemon_moves` (melhores counters) → `go_get_type_effectiveness`.

6. **`go_shadow_purify_advisor`** — vale purificar esse Shadow Pokémon?
   `go_get_shadow_pokemon` → `go_get_pokemon` (stats base) → `go_get_pokemon_moves` (moveset atual). Frustration (charged move fraco que todo Shadow recebe à força ao ser capturado — é justamente o que motiva purificar) e Return (charged move forte que todo Purified recebe em troca) são status universais que **não** aparecem em `current_pokemon_moves.json` por espécie — a tool precisa injetá-los explicitamente a partir de `charged_moves` (ids fixos), e não pode assumir que `go_get_pokemon_moves` os devolve sozinha.

7. **`go_iv_and_moveset_report`** — relatório único pra um Pokémon recém-capturado.
   `go_estimate_iv` (CP/HP → range de IV) → `go_get_pokemon` (stats base) → `go_get_pokemon_moves` pvp → `go_get_type_effectiveness`. Devolve % de IV estimado + qualidade do moveset + melhor liga (Great/Ultra/Master).

8. **`go_regional_dex_completion_helper`** — caminho mais rápido pra fechar a dex.
   `go_get_regional_forms` → `go_get_pokemon_sources` → `go_get_pokemon` (status released/shiny). Devolve, por Pokémon faltante, o canal de obtenção mais viável agora.

> Nenhuma dessas usa `get_type` ou dados de move da PokéAPI para números de jogo — só `go_get_type_effectiveness` e `go_get_pokemon_moves`, que são as versões corretas pro GO. PokéAPI entraria nessas composições no máximo pra enriquecer com sprite/artwork ou descrição de espécie, nunca pra cálculo.
