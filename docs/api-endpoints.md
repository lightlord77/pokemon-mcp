# Endpoints — PokéAPI e PoGo API

Referência completa dos endpoints disponíveis nas duas APIs usadas por este servidor MCP.

- PokéAPI: base `https://pokeapi.co/api/v2` — [docs oficiais](https://pokeapi.co/docs/v2)
- PoGo API: base `https://pogoapi.net/api/v1` — [docs oficiais](https://pogoapi.net/documentation/)

---

## PokéAPI (`https://pokeapi.co/api/v2`)

Todos os endpoints aceitam `{id}` numérico ou `{name}` (slug) como identificador, exceto onde indicado. Listagens (sem id) suportam paginação via `?limit=` e `?offset=`.

### Berries
| Endpoint | Descrição |
|---|---|
| `/berry/{id or name}/` | Dados de uma berry: tempo de crescimento, firmeza, sabores |
| `/berry-firmness/{id or name}/` | Classificação de textura da berry |
| `/berry-flavor/{id or name}/` | Perfis de sabor que afetam a nature do Pokémon |

### Contests
| Endpoint | Descrição |
|---|---|
| `/contest-type/{id or name}/` | Categorias de contest para avaliação de Pokémon |
| `/contest-effect/{id}/` | Efeitos de moves durante contests |
| `/super-contest-effect/{id}/` | Efeitos de moves durante super contests |

### Encounters
| Endpoint | Descrição |
|---|---|
| `/encounter-method/{id or name}/` | Métodos pelos quais o jogador encontra Pokémon selvagens |
| `/encounter-condition/{id or name}/` | Fatores ambientais que afetam encontros selvagens |
| `/encounter-condition-value/{id or name}/` | Estados específicos de uma encounter condition |

### Evolution
| Endpoint | Descrição |
|---|---|
| `/evolution-chain/{id}/` | Árvore genealógica completa de evolução |
| `/evolution-trigger/{id or name}/` | Eventos que causam evolução (nível, troca, item, etc.) |

### Games
| Endpoint | Descrição |
|---|---|
| `/generation/{id or name}/` | Agrupamento por geração do jogo (novos Pokémon e moves) |
| `/pokedex/{id or name}/` | Pokédex regionais |
| `/version/{id or name}/` | Versões individuais do jogo |
| `/version-group/{id or name}/` | Agrupamento de versões similares |

### Items
| Endpoint | Descrição |
|---|---|
| `/item/{id or name}/` | Objetos que o jogador pode carregar/usar |
| `/item-attribute/{id or name}/` | Características do item (ex: "usável em batalha") |
| `/item-category/{id or name}/` | Categorias de organização da bag |
| `/item-fling-effect/{id or name}/` | Efeitos causados pelo move Fling |
| `/item-pocket/{id or name}/` | Compartimentos da bag |

### Locations
| Endpoint | Descrição |
|---|---|
| `/location/{id or name}/` | Áreas do jogo (cidades, rotas) |
| `/location-area/{id or name}/` | Subáreas dentro de uma location |
| `/pal-park-area/{id or name}/` | Áreas de agrupamento de encontros no Pal Park |
| `/region/{id or name}/` | Regiões geográficas do mundo Pokémon |

### Machines
| Endpoint | Descrição |
|---|---|
| `/machine/{id}/` | Representação de itens (TM/HM) que ensinam moves |

### Moves
| Endpoint | Descrição |
|---|---|
| `/move/{id or name}/` | Ataques/skills de Pokémon em batalha |
| `/move-ailment/{id or name}/` | Condições de status causadas por moves |
| `/move-battle-style/{id or name}/` | Classificações de move do Battle Palace |
| `/move-category/{id or name}/` | Agrupamentos gerais de efeito de move |
| `/move-damage-class/{id or name}/` | Classificação física, especial ou não-dano |
| `/move-learn-method/{id or name}/` | Mecanismos de aprendizado de move |
| `/move-target/{id or name}/` | Alvos possíveis de um move |

### Pokémon
| Endpoint | Descrição |
|---|---|
| `/ability/{id or name}/` | Efeitos passivos em batalha ou no overworld |
| `/characteristic/{id}/` | Indicador de stat baseado no resto do IV |
| `/egg-group/{id or name}/` | Categorias de compatibilidade de reprodução |
| `/gender/{id or name}/` | Gênero (introduzido na Geração II para breeding) |
| `/growth-rate/{id or name}/` | Fórmulas de velocidade de ganho de experiência |
| `/nature/{id or name}/` | Influência no crescimento dos stats |
| `/pokeathlon-stat/{id or name}/` | Atributos de performance em Pokéathlons |
| `/pokemon/{id or name}/` | Pokémon individual com stats e moves |
| `/pokemon-location-areas/{id or name}/` | Locais de encontro selvagem |
| `/pokemon-color/{id or name}/` | Classificação visual por cor |
| `/pokemon-form/{id or name}/` | Formas/variantes de um Pokémon |
| `/pokemon-habitat/{id or name}/` | Categorização por ambiente |
| `/pokemon-shape/{id or name}/` | Tipos de silhueta física |
| `/pokemon-species/{id or name}/` | Dados base da espécie compartilhados entre variantes |
| `/stat/{id or name}/` | Estatísticas de batalha (HP, Attack, Defense, etc.) |
| `/type/{id or name}/` | Classificações elementais e efetividade de dano |

### Utility
| Endpoint | Descrição |
|---|---|
| `/language/{id or name}/` | Idiomas suportados para conteúdo localizado |

---

## PoGo API (`https://pogoapi.net/api/v1`)

Cada endpoint retorna um arquivo JSON completo (não é paginado por id — a resposta já vem com todos os registros). Formato: `GET /api/v1/{endpoint}.json`.

| Endpoint | Descrição |
|---|---|
| `api_hashes.json` | Hashes de todas as APIs disponíveis, para cache local |
| `pokemon_names.json` | Mapeamento de ID → nome do Pokémon |
| `released_pokemon.json` | Todos os Pokémon já lançados no GO |
| `nesting_pokemon.json` | Espécies conhecidas por aparecer em nesting locations |
| `shiny_pokemon.json` | Quais Pokémon têm variante shiny e como obtê-la |
| `raid_exclusive_pokemon.json` | Pokémon exclusivos de raid, com tier |
| `alolan_pokemon.json` | Variantes regionais de Alola disponíveis |
| `possible_ditto_pokemon.json` | Espécies que podem ser um Ditto disfarçado |
| `pokemon_stats.json` | Stats base (attack, defense, stamina) |
| `fast_moves.json` | Catálogo de fast moves com propriedades e dano |
| `charged_moves.json` | Catálogo de charged moves com poder e efeitos |
| `pokemon_max_cp.json` | CP máximo (perfeito, nível 40/50) por espécie |
| `pokemon_buddy_distances.json` | Distância de caminhada como buddy para ganhar candy |
| `pokemon_candy_to_evolve.json` | Custo de candy para evoluir, por Pokémon |
| `pokemon_encounter_data.json` | Métricas que afetam taxa de captura e comportamento |
| `pokemon_types.json` | Tipo(s) de cada espécie |
| `weather_boosts.json` | Mapeamento de clima → tipos boostados |
| `type_effectiveness.json` | Multiplicadores de dano por matchup de tipo |
| `pokemon_rarity.json` | Categoria: Standard, Legendary, Mythic |
| `pokemon_powerup_requirements.json` | Custo de stardust/candy para power up |
| `pokemon_genders.json` | Proporção de gênero por espécie |
| `player_xp_requirements.json` | XP acumulado necessário por nível de treinador |
| `pokemon_generations.json` | Geração de origem de cada Pokémon |
| `shadow_pokemon.json` | Pokémon obteníveis via Team GO Rocket |
| `pokemon_forms.json` | Variações de forma disponíveis por espécie |
| `current_pokemon_moves.json` | Moves aprendíveis atualmente (incl. Elite TM) |
| `pvp_exclusive_pokemon.json` | Pokémon exclusivos de recompensas de PvP |
| `galarian_pokemon.json` | Variantes regionais de Galar disponíveis |
| `cp_multiplier.json` | Multiplicador de CP por nível (CPM) |
| `community_days.json` | Histórico de Community Days, bônus e move exclusivo |
| `pokemon_evolutions.json` | Cadeias de evolução com requisitos/condições |
| `raid_bosses.json` | Raid bosses atuais e anteriores, por tier |
| `research_task_exclusive_pokemon.json` | Pokémon só disponíveis via field research |
| `mega_pokemon.json` | Pokémon com Mega Evolution e requisito de energia |
| `pokemon_height_weight_scale.json` | Dimensões físicas e escala do modelo 3D |
| `levelup_rewards.json` | Itens/desbloqueios por nível de treinador |
| `badges.json` | Badges de conquista e marcos de progressão |
| `gobattle_league_rewards.json` | Recompensas por partidas da Battle League |
| `raid_settings.json` | Mecânicas de raid: limite de convites, modificadores de dano |
| `mega_evolution_settings.json` | Mecânicas e multiplicadores de Mega Evolution |
| `friendship_level_settings.json` | Níveis de amizade e seus benefícios |
| `gobattle_ranking_settings.json` | Requisitos e faixas de ranking da Battle League |
| `baby_pokemon.json` | Pokémon obteníveis apenas via eclosão de ovo |
| `pvp_fast_moves.json` | Fast moves com stats específicos de PvP |
| `pvp_charged_moves.json` | Charged moves com stats, buffs e status de PvP |
| `time_limited_shiny_pokemon.json` | Shinies disponíveis apenas durante eventos |
| `photobomb_exclusive_pokemon.json` | Pokémon obtidos apenas via photobomb no GO Snapshot |

> Usados hoje por este servidor MCP (conferido contra `src/tools/*.ts` e `src/go-utils.ts`): `pokemon_stats.json`, `pokemon_types.json`, `pokemon_rarity.json`, `released_pokemon.json`, `shiny_pokemon.json`, `pokemon_max_cp.json`, `pokemon_buddy_distances.json`, `mega_pokemon.json`, `alolan_pokemon.json`, `galarian_pokemon.json`, `shadow_pokemon.json`, `current_pokemon_moves.json`, `fast_moves.json`, `charged_moves.json`, `pvp_fast_moves.json`, `pvp_charged_moves.json`, `pokemon_evolutions.json`, `raid_bosses.json`, `community_days.json`, `cp_multiplier.json`, `pokemon_powerup_requirements.json` (uso interno parcial), `pokemon_names.json` (uso interno) — os demais, incluindo `pokemon_forms.json` e `pokemon_candy_to_evolve.json` (nunca chamados hoje), estão disponíveis mas ainda não têm tool correspondente. Ver [`pogo-tool-proposals.md`](./pogo-tool-proposals.md) para o mapeamento completo e propostas de tools novas.
