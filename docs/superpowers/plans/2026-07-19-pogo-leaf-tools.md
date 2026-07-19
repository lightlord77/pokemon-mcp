# PoGo Leaf Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 13 new "leaf" (single-purpose, data-only) MCP tools from `docs/pogo-tool-proposals.md` §2, approved by the `brok` agent, covering the 13 PoGo API endpoints that currently have no tool.

**Architecture:** Each tool is a new file under `src/tools/`, following the exact pattern already used by `src/tools/go-raids.ts`/`go-community-days.ts`: a Zod input schema, a `getGoData<T>(endpoint)` fetch (cached 15 min by `src/go-client.ts`), a small shaping function, wrapped in `jsonResult`/`runTool` from `src/tool-helpers.ts`. No new dependencies. Tests use Node's built-in `node:test` + `node:assert/strict` (zero new dependency, matches `"engines": {"node": ">=18"}`) and hit the real PoGo API (this codebase never mocks — see existing tools) but assert only **stable structural facts** (documented per task), never volatile rotating content.

**Tech Stack:** TypeScript (strict, NodeNext), `@modelcontextprotocol/sdk`, `zod`, Node 18+ built-in `node:test`.

## Global Constraints

- Match existing code style exactly: 2-space indent, `z` schemas inline in `registerTool`'s `inputSchema`, errors thrown as plain `Error` (caught generically by `runTool`) or via existing error classes — never `console.log`/`console.error` inside tool logic.
- All new PoGo-specific TypeScript interfaces go in `src/go-types.ts`, appended at the end of the file (not scattered per tool file), matching current convention.
- Every new tool file exports exactly one `registerGoGetXTool(server: McpServer)` function, registered in `src/index.ts`.
- Never import anything from `src/pokeapi-client.ts` or `src/tools/{pokemon,evolution,moves,abilities,types,items,search}.ts` into any `go-*` tool file — GO tools only ever read PoGo API data (`src/go-client.ts`, `src/go-utils.ts`, `src/go-types.ts`).
- Reuse `resolveGoPokemon`, `pickNormalForm` from `src/go-utils.ts` wherever a tool takes a `name_or_id` and needs the canonical PoGo id — do not re-implement name resolution.
- Every task's tests must pass with `npm run build && node --test dist/tools/<file>.test.js` before moving to the next task.
- This plan does **not** touch `src/tools/{pokemon,evolution,moves,go-pokemon,go-moves,go-evolution,go-raids,go-iv}.ts` — those refactors belong to the separate composite-tools plan (`docs/superpowers/plans/2026-07-19-pogo-composite-tools.md`), which depends on some of the types this plan adds.

---

### Task 1: Test infrastructure + `go_get_type_effectiveness`

**Files:**
- Create: `src/test-helpers.ts`
- Modify: `package.json` (add `test` script)
- Modify: `src/go-types.ts` (append `GoTypeEffectivenessTable`)
- Create: `src/tools/go-type-effectiveness.ts`
- Test: `src/tools/go-type-effectiveness.test.ts`

**Interfaces:**
- Produces: `captureToolHandler(register, toolName)` in `src/test-helpers.ts` — reused by every later task's tests.
- Produces: `GoTypeEffectivenessTable = Record<string, Record<string, number>>` in `src/go-types.ts` — outer key is the attacking type (e.g. `"Fire"`), inner key is the defending type, value is the GO-specific multiplier (1.6 / 1 / 0.625, never 0 — GO has no true immunity).
- Produces: `registerGoGetTypeEffectivenessTool(server)` in `src/tools/go-type-effectiveness.ts`.

- [ ] **Step 1: Add the test script to `package.json`**

Edit the `"scripts"` block:

```json
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "test": "npm run build && node --test dist",
    "inspector": "npx @modelcontextprotocol/inspector node dist/index.js"
  },
```

- [ ] **Step 2: Create the shared test-handler helper**

Write `src/test-helpers.ts`:

```typescript
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

interface StubServer {
  registerTool(name: string, config: unknown, handler: ToolHandler): void;
}

/**
 * Captures the handler a `registerXTool(server)` function would install, without needing a real
 * McpServer or MCP connection — the same technique used to exercise these tools from outside the
 * MCP protocol. Throws if the given tool name was never registered.
 */
export function captureToolHandler(register: (server: StubServer) => void, toolName: string): ToolHandler {
  const handlers: Record<string, ToolHandler> = {};
  register({
    registerTool(name, _config, handler) {
      handlers[name] = handler;
    },
  });
  const handler = handlers[toolName];
  if (!handler) {
    throw new Error(`Tool '${toolName}' was not registered by the given register function.`);
  }
  return handler;
}

/** Parses the JSON text body a tool handler returns via `jsonResult`. */
export function parseToolJson(result: CallToolResult): any {
  const first = result.content[0];
  if (first.type !== "text") throw new Error("Expected a text content block.");
  return JSON.parse(first.text);
}
```

- [ ] **Step 3: Append the type effectiveness table type**

Append to the end of `src/go-types.ts`:

```typescript

/** Outer key = attacking type, inner key = defending type, value = GO-specific damage multiplier. */
export type GoTypeEffectivenessTable = Record<string, Record<string, number>>;
```

- [ ] **Step 4: Write the failing test**

Write `src/tools/go-type-effectiveness.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetTypeEffectivenessTool } from "./go-type-effectiveness.js";

test("go_get_type_effectiveness: Normal vs Ghost is nonzero (GO has no true immunity)", async () => {
  const handler = captureToolHandler(registerGoGetTypeEffectivenessTool, "go_get_type_effectiveness");
  const result = await handler({ attacking_type: "normal", defending_type: "ghost" });
  const body = parseToolJson(result);
  assert.equal(body.attacking_type, "Normal");
  assert.equal(body.defending_type, "Ghost");
  assert.ok(body.multiplier > 0, `expected a nonzero multiplier, got ${body.multiplier}`);
});

test("go_get_type_effectiveness: full row of 18 types is returned when defending_type is omitted", async () => {
  const handler = captureToolHandler(registerGoGetTypeEffectivenessTool, "go_get_type_effectiveness");
  const result = await handler({ attacking_type: "fire" });
  const body = parseToolJson(result);
  assert.equal(body.attacking_type, "Fire");
  assert.equal(Object.keys(body.effectiveness).length, 18);
});

test("go_get_type_effectiveness: rejects an invalid type name as a tool error, not a crash", async () => {
  const handler = captureToolHandler(registerGoGetTypeEffectivenessTool, "go_get_type_effectiveness");
  const result = await handler({ attacking_type: "not-a-type" });
  assert.equal(result.isError, true);
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-type-effectiveness.js'`

- [ ] **Step 6: Implement the tool**

Write `src/tools/go-type-effectiveness.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoTypeEffectivenessTable } from "../go-types.js";

const VALID_TYPES = [
  "Bug", "Dark", "Dragon", "Electric", "Fairy", "Fighting", "Fire", "Flying",
  "Ghost", "Grass", "Ground", "Ice", "Normal", "Poison", "Psychic", "Rock",
  "Steel", "Water",
];

function normalizeType(input: string): string {
  const needle = input.trim().toLowerCase();
  const match = VALID_TYPES.find((t) => t.toLowerCase() === needle);
  if (!match) {
    throw new Error(`Tipo '${input}' inválido. Tipos aceitos: ${VALID_TYPES.join(", ")}.`);
  }
  return match;
}

export function registerGoGetTypeEffectivenessTool(server: McpServer) {
  server.registerTool(
    "go_get_type_effectiveness",
    {
      title: "Efetividade de tipo no Pokémon GO",
      description:
        "Retorna os multiplicadores de dano por tipo específicos do Pokémon GO — diferentes dos jogos " +
        "principais: super efetivo é 1.6x, não muito efetivo é 0.625x, e não existe imunidade real (o que " +
        "seria 0x nos jogos principais vira dupla resistência 0.390625x no GO, então todo matchup causa " +
        "algum dano). Informe só 'attacking_type' pra ver a linha completa contra os 18 tipos, ou some " +
        "'defending_type' pra um único multiplicador.",
      inputSchema: {
        attacking_type: z.string().describe("Tipo que ataca (ex: 'fire', 'dragon')."),
        defending_type: z
          .string()
          .optional()
          .describe("Tipo que defende. Se omitido, retorna a efetividade contra todos os 18 tipos."),
      },
    },
    async ({ attacking_type, defending_type }) =>
      runTool(async () => {
        const table = await getGoData<GoTypeEffectivenessTable>("type_effectiveness");
        const attacker = normalizeType(attacking_type);
        const row = table[attacker];

        if (defending_type === undefined) {
          return jsonResult({ attacking_type: attacker, effectiveness: row });
        }

        const defender = normalizeType(defending_type);
        return jsonResult({ attacking_type: attacker, defending_type: defender, multiplier: row[defender] });
      }),
  );
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run build && node --test dist/tools/go-type-effectiveness.test.js`
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
git add package.json src/test-helpers.ts src/go-types.ts src/tools/go-type-effectiveness.ts src/tools/go-type-effectiveness.test.ts
git commit -m "feat: add go_get_type_effectiveness tool and node:test infra"
```

---

### Task 2: `go_get_weather_boosts`

**Files:**
- Modify: `src/go-types.ts` (append `GoWeatherBoosts`)
- Create: `src/tools/go-weather-boosts.ts`
- Test: `src/tools/go-weather-boosts.test.ts`

**Interfaces:**
- Consumes: `captureToolHandler`, `parseToolJson` from `../test-helpers.js` (Task 1).
- Produces: `registerGoGetWeatherBoostsTool(server)`.

- [ ] **Step 1: Append the type**

Append to `src/go-types.ts`:

```typescript

/** Key = weather condition name (e.g. "Clear", "Partly Cloudy"), value = boosted types. */
export type GoWeatherBoosts = Record<string, string[]>;
```

- [ ] **Step 2: Write the failing test**

Write `src/tools/go-weather-boosts.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetWeatherBoostsTool } from "./go-weather-boosts.js";

test("go_get_weather_boosts: Clear boosts Fire, Grass and Ground (stable since the weather system launched)", async () => {
  const handler = captureToolHandler(registerGoGetWeatherBoostsTool, "go_get_weather_boosts");
  const result = await handler({ weather: "clear" });
  const body = parseToolJson(result);
  assert.equal(body.weather, "Clear");
  assert.ok(body.boosted_types.includes("Fire"));
  assert.ok(body.boosted_types.includes("Grass"));
  assert.ok(body.boosted_types.includes("Ground"));
});

test("go_get_weather_boosts: returns all 7 weather conditions when no filter is given", async () => {
  const handler = captureToolHandler(registerGoGetWeatherBoostsTool, "go_get_weather_boosts");
  const result = await handler({});
  const body = parseToolJson(result);
  assert.equal(Object.keys(body.boosts).length, 7);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-weather-boosts.js'`

- [ ] **Step 4: Implement the tool**

Write `src/tools/go-weather-boosts.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoWeatherBoosts } from "../go-types.js";

export function registerGoGetWeatherBoostsTool(server: McpServer) {
  server.registerTool(
    "go_get_weather_boosts",
    {
      title: "Clima que dá boost de tipo no Pokémon GO",
      description:
        "Retorna quais tipos ganham boost (aumento de CP e chance de acerto crítico) sob cada condição de " +
        "clima. Informe 'weather' pra um clima específico, ou deixe em branco pra ver o mapeamento completo.",
      inputSchema: {
        weather: z
          .string()
          .optional()
          .describe("Nome do clima (ex: 'Clear', 'Partly Cloudy', 'Rainy'). Case-insensitive."),
      },
    },
    async ({ weather }) =>
      runTool(async () => {
        const boosts = await getGoData<GoWeatherBoosts>("weather_boosts");

        if (weather === undefined) {
          return jsonResult({ boosts });
        }

        const needle = weather.trim().toLowerCase();
        const matchedKey = Object.keys(boosts).find((k) => k.toLowerCase() === needle);
        if (!matchedKey) {
          throw new Error(`Clima '${weather}' inválido. Climas aceitos: ${Object.keys(boosts).join(", ")}.`);
        }
        return jsonResult({ weather: matchedKey, boosted_types: boosts[matchedKey] });
      }),
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-weather-boosts.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/go-types.ts src/tools/go-weather-boosts.ts src/tools/go-weather-boosts.test.ts
git commit -m "feat: add go_get_weather_boosts tool"
```

---

### Task 3: `go_get_regional_forms`

**Note on the spec correction:** `docs/pogo-tool-proposals.md` says this tool consumes `pokemon_forms.json`. Verified live against the real endpoint: `pokemon_forms.json` is a flat array of ~270 valid form-name **strings** (e.g. `"Hisuian"`, `"Paldea_aqua"`) used as an enum elsewhere in the API — it is **not** a per-species mapping and cannot answer "which Pokémon have a Hisui/Paldea form". That data actually lives in `pokemon_stats.json`, which has one entry per `(pokemon_id, form)` pair (confirmed live: Voltorb has a `"Hisuian"` entry, Tauros has `"Paldea_aqua"`/`"Paldea_blaze"`/`"Paldea_combat"` entries). This task scans `pokemon_stats.json` for `form` values of `"Hisuian"` or starting with `"Paldea"` instead.

**Files:**
- Modify: `src/go-types.ts` (append `GoRegionalFormEntry`)
- Create: `src/tools/go-regional-forms.ts`
- Test: `src/tools/go-regional-forms.test.ts`

**Interfaces:**
- Consumes: `GoNamesById`, `GoStatsEntry` (already in `src/go-types.ts`).
- Produces: `GoRegionalFormEntry = { pokemon_id: number; pokemon_name: string; region: "Alola" | "Galar" | "Hisui" | "Paldea"; form: string }` in `src/go-types.ts`.
- Produces: `registerGoGetRegionalFormsTool(server)`.

- [ ] **Step 1: Append the type**

Append to `src/go-types.ts`:

```typescript

export interface GoRegionalFormEntry {
  pokemon_id: number;
  pokemon_name: string;
  region: "Alola" | "Galar" | "Hisui" | "Paldea";
  form: string;
}
```

- [ ] **Step 2: Write the failing test**

Write `src/tools/go-regional-forms.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetRegionalFormsTool } from "./go-regional-forms.js";

test("go_get_regional_forms: Voltorb has a Hisui-region entry (not just Alola/Galar)", async () => {
  const handler = captureToolHandler(registerGoGetRegionalFormsTool, "go_get_regional_forms");
  const result = await handler({ name_or_id: "voltorb" });
  const body = parseToolJson(result);
  assert.ok(body.forms.some((f: any) => f.region === "Hisui"), JSON.stringify(body.forms));
});

test("go_get_regional_forms: Tauros has 3 Paldea-region entries", async () => {
  const handler = captureToolHandler(registerGoGetRegionalFormsTool, "go_get_regional_forms");
  const result = await handler({ name_or_id: "tauros" });
  const body = parseToolJson(result);
  const paldea = body.forms.filter((f: any) => f.region === "Paldea");
  assert.equal(paldea.length, 3);
});

test("go_get_regional_forms: Meowth has an Alola-region entry", async () => {
  const handler = captureToolHandler(registerGoGetRegionalFormsTool, "go_get_regional_forms");
  const result = await handler({ name_or_id: "meowth" });
  const body = parseToolJson(result);
  assert.ok(body.forms.some((f: any) => f.region === "Alola"));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-regional-forms.js'`

- [ ] **Step 4: Implement the tool**

Write `src/tools/go-regional-forms.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoNamesById, GoRegionalFormEntry, GoStatsEntry } from "../go-types.js";

async function collectRegionalForms(): Promise<GoRegionalFormEntry[]> {
  const [alolan, galarian, stats] = await Promise.all([
    getGoData<GoNamesById>("alolan_pokemon"),
    getGoData<GoNamesById>("galarian_pokemon"),
    getGoData<GoStatsEntry[]>("pokemon_stats"),
  ]);

  const entries: GoRegionalFormEntry[] = [];
  for (const entry of Object.values(alolan)) {
    entries.push({ pokemon_id: entry.id, pokemon_name: entry.name, region: "Alola", form: "Alola" });
  }
  for (const entry of Object.values(galarian)) {
    entries.push({ pokemon_id: entry.id, pokemon_name: entry.name, region: "Galar", form: "Galarian" });
  }

  const seen = new Set<string>();
  for (const stat of stats) {
    const isHisui = stat.form === "Hisuian";
    const isPaldea = stat.form === "Paldea" || stat.form.startsWith("Paldea_");
    if (!isHisui && !isPaldea) continue;
    const key = `${stat.pokemon_id}:${stat.form}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      pokemon_id: stat.pokemon_id,
      pokemon_name: stat.pokemon_name,
      region: isHisui ? "Hisui" : "Paldea",
      form: stat.form,
    });
  }
  return entries;
}

export function registerGoGetRegionalFormsTool(server: McpServer) {
  server.registerTool(
    "go_get_regional_forms",
    {
      title: "Formas regionais disponíveis no Pokémon GO",
      description:
        "Lista Pokémon com forma regional (Alola, Galar, Hisui, Paldea) já disponível no Pokémon GO. " +
        "Diferente de 'go_get_pokemon', que só sinaliza um booleano de Alola/Galar por espécie, esta tool " +
        "devolve a lista completa incluindo Hisui/Paldea. Informe 'name_or_id' pra filtrar por uma espécie.",
      inputSchema: {
        name_or_id: z
          .string()
          .optional()
          .describe("Filtra por substring do nome (case-insensitive) ou id numérico exato."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const all = await collectRegionalForms();
        let forms = all;

        if (name_or_id !== undefined) {
          const trimmed = name_or_id.trim();
          if (/^\d+$/.test(trimmed)) {
            const id = Number(trimmed);
            forms = all.filter((f) => f.pokemon_id === id);
          } else {
            const needle = trimmed.toLowerCase();
            forms = all.filter((f) => f.pokemon_name.toLowerCase().includes(needle));
          }
        }

        return jsonResult({ total: forms.length, forms });
      }),
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-regional-forms.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/go-types.ts src/tools/go-regional-forms.ts src/tools/go-regional-forms.test.ts
git commit -m "feat: add go_get_regional_forms tool (scans pokemon_stats.json, not pokemon_forms.json)"
```

---

### Task 4: `go_get_shadow_pokemon`

**Files:**
- Create: `src/tools/go-shadow-pokemon.ts`
- Test: `src/tools/go-shadow-pokemon.test.ts`

**Interfaces:**
- Consumes: `GoNamesById` (existing type).
- Produces: `registerGoGetShadowPokemonTool(server)`.

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-shadow-pokemon.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetShadowPokemonTool } from "./go-shadow-pokemon.js";

test("go_get_shadow_pokemon: Larvitar is Shadow-available (long-standing Team GO Rocket line)", async () => {
  const handler = captureToolHandler(registerGoGetShadowPokemonTool, "go_get_shadow_pokemon");
  const result = await handler({ name_or_id: "larvitar" });
  const body = parseToolJson(result);
  assert.ok(body.total >= 1);
  assert.equal(body.pokemon[0].name, "Larvitar");
});

test("go_get_shadow_pokemon: full list without filter is non-empty and well-formed", async () => {
  const handler = captureToolHandler(registerGoGetShadowPokemonTool, "go_get_shadow_pokemon");
  const result = await handler({});
  const body = parseToolJson(result);
  assert.ok(body.total > 50);
  assert.ok(typeof body.pokemon[0].id === "number");
  assert.ok(typeof body.pokemon[0].name === "string");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-shadow-pokemon.js'`

- [ ] **Step 3: Implement the tool**

Write `src/tools/go-shadow-pokemon.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoNamesById } from "../go-types.js";

export function registerGoGetShadowPokemonTool(server: McpServer) {
  server.registerTool(
    "go_get_shadow_pokemon",
    {
      title: "Pokémon obteníveis como Shadow no Pokémon GO",
      description:
        "Lista completa e dedicada de Pokémon obteníveis como Shadow via Team GO Rocket. Diferente de " +
        "'go_get_pokemon', que só sinaliza um booleano 'shadow_available' por espécie.",
      inputSchema: {
        name_or_id: z
          .string()
          .optional()
          .describe("Filtra por substring do nome (case-insensitive) ou id numérico exato."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const all = Object.values(await getGoData<GoNamesById>("shadow_pokemon"));
        let pokemon = all;

        if (name_or_id !== undefined) {
          const trimmed = name_or_id.trim();
          if (/^\d+$/.test(trimmed)) {
            const id = Number(trimmed);
            pokemon = all.filter((p) => p.id === id);
          } else {
            const needle = trimmed.toLowerCase();
            pokemon = all.filter((p) => p.name.toLowerCase().includes(needle));
          }
        }

        return jsonResult({ total: pokemon.length, pokemon });
      }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-shadow-pokemon.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-shadow-pokemon.ts src/tools/go-shadow-pokemon.test.ts
git commit -m "feat: add go_get_shadow_pokemon tool"
```

---

### Task 5: `go_get_mega_pokemon`

**Files:**
- Modify: `src/go-types.ts` (append `GoMegaEvolutionSettings`)
- Create: `src/tools/go-mega-pokemon.ts`
- Test: `src/tools/go-mega-pokemon.test.ts`

**Interfaces:**
- Consumes: `GoMegaEntry` (existing type), `resolveGoPokemon` from `../go-utils.js`.
- Produces: `GoMegaEvolutionSettings` in `src/go-types.ts`.
- Produces: `registerGoGetMegaPokemonTool(server)`.

- [ ] **Step 1: Append the type**

Append to `src/go-types.ts`:

```typescript

export interface GoMegaEvolutionSettings {
  general_attack_boost: number;
  max_mega_candy: number;
  mega_evolution_bonus_catch_candy: number;
  mega_evolution_duration: number;
  same_type_attack_boost: number;
  walking_buddy_gives_mega_energy: boolean;
}
```

- [ ] **Step 2: Write the failing test**

Write `src/tools/go-mega-pokemon.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetMegaPokemonTool } from "./go-mega-pokemon.js";

test("go_get_mega_pokemon: settings carry the same-type boost of 1.3x", async () => {
  const handler = captureToolHandler(registerGoGetMegaPokemonTool, "go_get_mega_pokemon");
  const result = await handler({});
  const body = parseToolJson(result);
  assert.equal(body.settings.same_type_attack_boost, 1.3);
  assert.equal(body.settings.general_attack_boost, 1.1);
});

test("go_get_mega_pokemon: Venusaur mega form has a lower recurring energy cost than the first-time cost", async () => {
  const handler = captureToolHandler(registerGoGetMegaPokemonTool, "go_get_mega_pokemon");
  const result = await handler({ name_or_id: "venusaur" });
  const body = parseToolJson(result);
  assert.equal(body.mega_forms.length, 1);
  assert.ok(body.mega_forms[0].mega_energy_required < body.mega_forms[0].first_time_mega_energy_required);
});

test("go_get_mega_pokemon: a species with no mega form returns an empty list, not an error", async () => {
  const handler = captureToolHandler(registerGoGetMegaPokemonTool, "go_get_mega_pokemon");
  const result = await handler({ name_or_id: "pikachu" });
  const body = parseToolJson(result);
  assert.equal(result.isError, undefined);
  assert.equal(body.mega_forms.length, 0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-mega-pokemon.js'`

- [ ] **Step 4: Implement the tool**

Write `src/tools/go-mega-pokemon.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { resolveGoPokemon } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoMegaEntry, GoMegaEvolutionSettings } from "../go-types.js";

export function registerGoGetMegaPokemonTool(server: McpServer) {
  server.registerTool(
    "go_get_mega_pokemon",
    {
      title: "Mega Evolução no Pokémon GO",
      description:
        "Retorna quais Pokémon mega evoluem, custo de energia (1ª vez vs. recorrente) e os bônus de batalha " +
        "da mega evolução (boost geral e boost de mesmo tipo). Informe 'name_or_id' pra uma espécie " +
        "específica, ou deixe em branco pra ver todas.",
      inputSchema: {
        name_or_id: z.string().optional().describe("Nome ou id do Pokémon. Se omitido, retorna todas as megas."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const [settings, allMegas] = await Promise.all([
          getGoData<GoMegaEvolutionSettings>("mega_evolution_settings"),
          getGoData<GoMegaEntry[]>("mega_pokemon"),
        ]);

        let megaForms = allMegas;
        if (name_or_id !== undefined) {
          const { id } = await resolveGoPokemon(name_or_id);
          megaForms = allMegas.filter((m) => m.pokemon_id === id);
        }

        return jsonResult({ settings, mega_forms: megaForms });
      }),
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-mega-pokemon.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/go-types.ts src/tools/go-mega-pokemon.ts src/tools/go-mega-pokemon.test.ts
git commit -m "feat: add go_get_mega_pokemon tool"
```

---

### Task 6: `go_get_pokemon_sources`

**Files:**
- Modify: `src/go-types.ts` (append `GoRaidExclusiveEntry`, `GoRaidExclusiveById`, `GoFormTaggedEntry`)
- Create: `src/tools/go-pokemon-sources.ts`
- Test: `src/tools/go-pokemon-sources.test.ts`

**Interfaces:**
- Consumes: `GoNamesById` (existing), `resolveGoPokemon` from `../go-utils.js`.
- Produces: `GoRaidExclusiveEntry`, `GoRaidExclusiveById`, `GoFormTaggedEntry` in `src/go-types.ts` — `GoFormTaggedEntry` is reused by Task 13 (`go_get_shiny_events`) and by the composite-tools plan.
- Produces: `registerGoGetPokemonSourcesTool(server)`.

- [ ] **Step 1: Append the types**

Append to `src/go-types.ts`:

```typescript

export interface GoRaidExclusiveEntry {
  id: number;
  name: string;
  raid_level: number;
}

export type GoRaidExclusiveById = Record<string, GoRaidExclusiveEntry>;

/** Shape shared by pvp_exclusive_pokemon.json, research_task_exclusive_pokemon.json, baby_pokemon.json and photobomb_exclusive_pokemon.json. */
export interface GoFormTaggedEntry {
  form: string;
  id: number;
  name: string;
}
```

- [ ] **Step 2: Write the failing test**

Write `src/tools/go-pokemon-sources.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetPokemonSourcesTool } from "./go-pokemon-sources.js";

test("go_get_pokemon_sources: Spinda is research-task-exclusive (evergreen since launch)", async () => {
  const handler = captureToolHandler(registerGoGetPokemonSourcesTool, "go_get_pokemon_sources");
  const result = await handler({ name_or_id: "spinda" });
  const body = parseToolJson(result);
  assert.equal(body.sources.research_task_exclusive, true);
});

test("go_get_pokemon_sources: Pidgey has never been exclusive to anything", async () => {
  const handler = captureToolHandler(registerGoGetPokemonSourcesTool, "go_get_pokemon_sources");
  const result = await handler({ name_or_id: "pidgey" });
  const body = parseToolJson(result);
  assert.equal(body.sources.raid_exclusive, null);
  assert.equal(body.sources.pvp_exclusive, false);
  assert.equal(body.sources.research_task_exclusive, false);
  assert.equal(body.sources.baby, false);
  assert.equal(body.sources.photobomb_exclusive, false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-pokemon-sources.js'`

- [ ] **Step 4: Implement the tool**

Write `src/tools/go-pokemon-sources.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { resolveGoPokemon } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoFormTaggedEntry, GoNamesById, GoRaidExclusiveById } from "../go-types.js";

export function registerGoGetPokemonSourcesTool(server: McpServer) {
  server.registerTool(
    "go_get_pokemon_sources",
    {
      title: "Canais de obtenção exclusivos de um Pokémon no Pokémon GO",
      description:
        "Dado um Pokémon, diz em quais canais de obtenção exclusivos ele aparece: nest, raid exclusivo, " +
        "disfarce possível de Ditto, recompensa exclusiva de PvP, pesquisa de campo exclusiva, disponível só " +
        "via eclosão de ovo (baby), ou exclusivo de photobomb no GO Snapshot.",
      inputSchema: {
        name_or_id: z.string().describe("Nome ou id do Pokémon."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const { id, name } = await resolveGoPokemon(name_or_id);

        const [nesting, raidExclusive, possibleDitto, pvpExclusive, researchExclusive, baby, photobomb] =
          await Promise.all([
            getGoData<GoNamesById>("nesting_pokemon"),
            getGoData<GoRaidExclusiveById>("raid_exclusive_pokemon"),
            getGoData<GoNamesById>("possible_ditto_pokemon"),
            getGoData<GoFormTaggedEntry[]>("pvp_exclusive_pokemon"),
            getGoData<GoFormTaggedEntry[]>("research_task_exclusive_pokemon"),
            getGoData<GoFormTaggedEntry[]>("baby_pokemon"),
            getGoData<GoFormTaggedEntry[]>("photobomb_exclusive_pokemon"),
          ]);

        const raidEntry = Object.values(raidExclusive).find((r) => r.id === id);

        return jsonResult({
          pokemon: name,
          sources: {
            nesting: id in nesting,
            raid_exclusive: raidEntry ? { raid_level: raidEntry.raid_level } : null,
            possible_ditto_disguise: id in possibleDitto,
            pvp_exclusive: pvpExclusive.some((p) => p.id === id),
            research_task_exclusive: researchExclusive.some((p) => p.id === id),
            baby: baby.some((p) => p.id === id),
            photobomb_exclusive: photobomb.some((p) => p.id === id),
          },
        });
      }),
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-pokemon-sources.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/go-types.ts src/tools/go-pokemon-sources.ts src/tools/go-pokemon-sources.test.ts
git commit -m "feat: add go_get_pokemon_sources tool"
```

---

### Task 7: `go_get_encounter_data`

**Files:**
- Modify: `src/go-types.ts` (append `GoEncounterDataEntry`)
- Create: `src/tools/go-encounter-data.ts`
- Test: `src/tools/go-encounter-data.test.ts`

**Interfaces:**
- Consumes: `resolveGoPokemon`, `pickNormalForm` from `../go-utils.js`.
- Produces: `GoEncounterDataEntry` in `src/go-types.ts`.
- Produces: `registerGoGetEncounterDataTool(server)`.

- [ ] **Step 1: Append the type**

Append to `src/go-types.ts`:

```typescript

export interface GoEncounterDataEntry {
  pokemon_id: number;
  pokemon_name: string;
  form: string;
  attack_probability: number;
  dodge_probability: number;
  min_pokemon_action_frequency: number;
  max_pokemon_action_frequency: number;
  base_capture_rate: number;
  base_flee_rate: number;
}
```

- [ ] **Step 2: Write the failing test**

Write `src/tools/go-encounter-data.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetEncounterDataTool } from "./go-encounter-data.js";

test("go_get_encounter_data: base_capture_rate/base_flee_rate are the documented -1 placeholder, not a real rate", async () => {
  const handler = captureToolHandler(registerGoGetEncounterDataTool, "go_get_encounter_data");
  const result = await handler({ name_or_id: "bulbasaur" });
  const body = parseToolJson(result);
  assert.equal(body.base_capture_rate, -1);
  assert.equal(body.base_flee_rate, -1);
  assert.ok(typeof body.note === "string" && body.note.length > 0);
});

test("go_get_encounter_data: attack/dodge probability are real numbers between 0 and 1", async () => {
  const handler = captureToolHandler(registerGoGetEncounterDataTool, "go_get_encounter_data");
  const result = await handler({ name_or_id: "bulbasaur" });
  const body = parseToolJson(result);
  assert.ok(body.attack_probability >= 0 && body.attack_probability <= 1);
  assert.ok(body.dodge_probability >= 0 && body.dodge_probability <= 1);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-encounter-data.js'`

- [ ] **Step 4: Implement the tool**

Write `src/tools/go-encounter-data.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { pickNormalForm, resolveGoPokemon } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoEncounterDataEntry } from "../go-types.js";

export function registerGoGetEncounterDataTool(server: McpServer) {
  server.registerTool(
    "go_get_encounter_data",
    {
      title: "Dados de encontro selvagem no Pokémon GO",
      description:
        "Retorna a probabilidade de ataque/esquiva e a frequência de ação de um Pokémon selvagem durante o " +
        "minigame de captura. NÃO retorna uma taxa de captura/fuga real: 'base_capture_rate' e " +
        "'base_flee_rate' vêm como placeholder -1 na fonte atual pra todas as espécies testadas.",
      inputSchema: {
        name_or_id: z.string().describe("Nome ou id do Pokémon."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const { id, name } = await resolveGoPokemon(name_or_id);
        const all = await getGoData<GoEncounterDataEntry[]>("pokemon_encounter_data");
        const entry = pickNormalForm(all, id);
        if (!entry) {
          throw new Error(`Dados de encontro não encontrados para '${name}' no Pokémon GO.`);
        }

        return jsonResult({
          pokemon: name,
          attack_probability: entry.attack_probability,
          dodge_probability: entry.dodge_probability,
          min_pokemon_action_frequency: entry.min_pokemon_action_frequency,
          max_pokemon_action_frequency: entry.max_pokemon_action_frequency,
          base_capture_rate: entry.base_capture_rate,
          base_flee_rate: entry.base_flee_rate,
          note:
            "base_capture_rate e base_flee_rate vêm como -1 (placeholder não populado) na fonte atual — não " +
            "representam uma taxa de captura/fuga real.",
        });
      }),
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-encounter-data.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/go-types.ts src/tools/go-encounter-data.ts src/tools/go-encounter-data.test.ts
git commit -m "feat: add go_get_encounter_data tool"
```

---

### Task 8: `go_get_powerup_cost`

**Files:**
- Create: `src/tools/go-powerup-cost.ts`
- Test: `src/tools/go-powerup-cost.test.ts`

**Interfaces:**
- Consumes: `GoPowerupRequirementsByLevel`, `GoPowerupRequirement` (already in `src/go-types.ts` — no new type needed).
- Produces: `registerGoGetPowerupCostTool(server)`.

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-powerup-cost.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetPowerupCostTool } from "./go-powerup-cost.js";

test("go_get_powerup_cost: XL candy is required starting exactly at level 40, not before", async () => {
  const handler = captureToolHandler(registerGoGetPowerupCostTool, "go_get_powerup_cost");
  const result = await handler({ level_from: 39, level_to: 40 });
  const body = parseToolJson(result);
  const byLevel = Object.fromEntries(body.requirements.map((r: any) => [r.current_level, r]));
  assert.equal(byLevel[39].xl_candy_to_upgrade, 0);
  assert.ok(byLevel[40].xl_candy_to_upgrade > 0);
});

test("go_get_powerup_cost: full table is returned without a range filter", async () => {
  const handler = captureToolHandler(registerGoGetPowerupCostTool, "go_get_powerup_cost");
  const result = await handler({});
  const body = parseToolJson(result);
  assert.ok(body.total > 50);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-powerup-cost.js'`

- [ ] **Step 3: Implement the tool**

Write `src/tools/go-powerup-cost.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoPowerupRequirementsByLevel } from "../go-types.js";

export function registerGoGetPowerupCostTool(server: McpServer) {
  server.registerTool(
    "go_get_powerup_cost",
    {
      title: "Custo de power up por nível no Pokémon GO",
      description:
        "Retorna a tabela completa de custo por nível de power up: stardust, candy normal e XL Candy (moeda " +
        "separada, relevante a partir do nível 40). Informe 'level_from'/'level_to' pra restringir a uma " +
        "faixa, ou deixe em branco pra ver a tabela inteira.",
      inputSchema: {
        level_from: z.number().min(1).max(49.5).optional().describe("Nível mínimo (inclusive) do intervalo."),
        level_to: z.number().min(1).max(49.5).optional().describe("Nível máximo (inclusive) do intervalo."),
      },
    },
    async ({ level_from, level_to }) =>
      runTool(async () => {
        const table = await getGoData<GoPowerupRequirementsByLevel>("pokemon_powerup_requirements");
        let requirements = Object.values(table).sort((a, b) => a.current_level - b.current_level);

        if (level_from !== undefined) {
          requirements = requirements.filter((r) => r.current_level >= level_from);
        }
        if (level_to !== undefined) {
          requirements = requirements.filter((r) => r.current_level <= level_to);
        }

        return jsonResult({ total: requirements.length, requirements });
      }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-powerup-cost.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-powerup-cost.ts src/tools/go-powerup-cost.test.ts
git commit -m "feat: add go_get_powerup_cost tool"
```

---

### Task 9: `go_get_trainer_progression`

**Files:**
- Modify: `src/go-types.ts` (append `GoXpRequirementsByLevel`, `GoLevelupRewardItem`, `GoLevelupReward`, `GoBadge`)
- Create: `src/tools/go-trainer-progression.ts`
- Test: `src/tools/go-trainer-progression.test.ts`

**Interfaces:**
- Produces: 4 types in `src/go-types.ts`.
- Produces: `registerGoGetTrainerProgressionTool(server)`.

- [ ] **Step 1: Append the types**

Append to `src/go-types.ts`:

```typescript

/** Key = level as a string ("1".."50"), value = cumulative XP required to reach that level. */
export type GoXpRequirementsByLevel = Record<string, number>;

export interface GoLevelupRewardItem {
  item: string;
  amount_received: number;
}

export interface GoLevelupReward {
  level: number;
  items_received: GoLevelupRewardItem[];
}

export interface GoBadge {
  name: string;
  description: string;
  event_badge: boolean;
  rank: number;
  targets: number[];
}
```

- [ ] **Step 2: Write the failing test**

Write `src/tools/go-trainer-progression.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetTrainerProgressionTool } from "./go-trainer-progression.js";

test("go_get_trainer_progression: level 1 always requires 0 cumulative XP", async () => {
  const handler = captureToolHandler(registerGoGetTrainerProgressionTool, "go_get_trainer_progression");
  const result = await handler({ level: 1 });
  const body = parseToolJson(result);
  assert.equal(body.xp_required, 0);
});

test("go_get_trainer_progression: badge_query finds the Triathlete badge by name", async () => {
  const handler = captureToolHandler(registerGoGetTrainerProgressionTool, "go_get_trainer_progression");
  const result = await handler({ badge_query: "Triathlete" });
  const body = parseToolJson(result);
  assert.ok(body.badges.some((b: any) => b.name === "Triathlete"));
});

test("go_get_trainer_progression: no params returns the full 50-level XP table", async () => {
  const handler = captureToolHandler(registerGoGetTrainerProgressionTool, "go_get_trainer_progression");
  const result = await handler({});
  const body = parseToolJson(result);
  assert.equal(Object.keys(body.xp_table).length, 50);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-trainer-progression.js'`

- [ ] **Step 4: Implement the tool**

Write `src/tools/go-trainer-progression.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoBadge, GoLevelupReward, GoXpRequirementsByLevel } from "../go-types.js";

const MAX_BADGE_RESULTS = 20;

export function registerGoGetTrainerProgressionTool(server: McpServer) {
  server.registerTool(
    "go_get_trainer_progression",
    {
      title: "Progressão de treinador no Pokémon GO",
      description:
        "Retorna a curva de XP acumulado por nível de treinador (1-50) e as recompensas de level up. " +
        "Informe 'level' pra um nível específico (XP necessário + recompensa daquele nível, se houver), " +
        "'badge_query' pra buscar badges de conquista por nome/descrição (máx. 20 resultados), ou nenhum " +
        "dos dois pra ver a tabela completa de XP por nível.",
      inputSchema: {
        level: z.number().int().min(1).max(50).optional().describe("Nível de treinador (1-50)."),
        badge_query: z.string().optional().describe("Substring (case-insensitive) do nome/descrição do badge."),
      },
    },
    async ({ level, badge_query }) =>
      runTool(async () => {
        if (badge_query !== undefined) {
          const allBadges = await getGoData<GoBadge[]>("badges");
          const needle = badge_query.trim().toLowerCase();
          const matches = allBadges.filter(
            (b) => b.name.toLowerCase().includes(needle) || b.description.toLowerCase().includes(needle),
          );
          return jsonResult({
            total_matches: matches.length,
            returned: Math.min(matches.length, MAX_BADGE_RESULTS),
            badges: matches.slice(0, MAX_BADGE_RESULTS),
          });
        }

        const xpTable = await getGoData<GoXpRequirementsByLevel>("player_xp_requirements");

        if (level !== undefined) {
          const rewards = await getGoData<GoLevelupReward[]>("levelup_rewards");
          const reward = rewards.find((r) => r.level === level) ?? null;
          return jsonResult({ level, xp_required: xpTable[String(level)], reward });
        }

        return jsonResult({ xp_table: xpTable });
      }),
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-trainer-progression.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/go-types.ts src/tools/go-trainer-progression.ts src/tools/go-trainer-progression.test.ts
git commit -m "feat: add go_get_trainer_progression tool"
```

---

### Task 10: `go_get_battle_league_info`

**Files:**
- Modify: `src/go-types.ts` (append `GoBattleLeagueRewardItem`, `GoBattleLeagueRankRewards`, `GoBattleLeagueRewardsByRank`, `GoRankRequirement`, `GoBattleRankingSettings`)
- Create: `src/tools/go-battle-league-info.ts`
- Test: `src/tools/go-battle-league-info.test.ts`

**Interfaces:**
- Produces: 5 types in `src/go-types.ts`.
- Produces: `registerGoGetBattleLeagueInfoTool(server)`.

- [ ] **Step 1: Append the types**

Append to `src/go-types.ts`:

```typescript

export interface GoBattleLeagueRewardItem {
  type: string;
  amount?: number;
  item_name?: string;
}

export interface GoBattleLeagueRankRewards {
  rank: number;
  free: GoBattleLeagueRewardItem[];
  premium: GoBattleLeagueRewardItem[];
}

/** Key = rank as a string ("1".."24"). */
export type GoBattleLeagueRewardsByRank = Record<string, GoBattleLeagueRankRewards>;

export interface GoRankRequirement {
  rank: number;
  additional_battles_required?: number;
  additional_battle_wins_required?: number;
}

export interface GoBattleRankingSettings {
  min_rank_to_display_rating: number;
  rank_requirements: GoRankRequirement[];
  requirements_for_rewards: { rank: number; min_total_battles: number };
}
```

- [ ] **Step 2: Write the failing test**

Write `src/tools/go-battle-league-info.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetBattleLeagueInfoTool } from "./go-battle-league-info.js";

test("go_get_battle_league_info: rank 1 has free and premium reward tracks with typed items", async () => {
  const handler = captureToolHandler(registerGoGetBattleLeagueInfoTool, "go_get_battle_league_info");
  const result = await handler({ rank: 1 });
  const body = parseToolJson(result);
  assert.ok(Array.isArray(body.rewards.free) && body.rewards.free.length > 0);
  assert.ok(Array.isArray(body.rewards.premium) && body.rewards.premium.length > 0);
  assert.ok(typeof body.rewards.free[0].type === "string");
});

test("go_get_battle_league_info: ranking_settings always has a nonempty rank_requirements list", async () => {
  const handler = captureToolHandler(registerGoGetBattleLeagueInfoTool, "go_get_battle_league_info");
  const result = await handler({});
  const body = parseToolJson(result);
  assert.ok(body.ranking_settings.rank_requirements.length > 0);
  assert.ok(body.ranking_settings.rank_requirements.every((r: any) => typeof r.rank === "number"));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-battle-league-info.js'`

- [ ] **Step 4: Implement the tool**

Write `src/tools/go-battle-league-info.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoBattleLeagueRewardsByRank, GoBattleRankingSettings } from "../go-types.js";

export function registerGoGetBattleLeagueInfoTool(server: McpServer) {
  server.registerTool(
    "go_get_battle_league_info",
    {
      title: "Recompensas e requisitos de rank da GO Battle League",
      description:
        "Retorna as recompensas (faixa gratuita e premium) por rank da GO Battle League e os requisitos de " +
        "batalhas/vitórias pra subir de rank. Informe 'rank' (número, 1 em diante — a API não usa nomes como " +
        "'Legend') pra um rank específico, ou deixe em branco pra ver todos os ranks.",
      inputSchema: {
        rank: z.number().int().min(1).optional().describe("Número do rank da Battle League."),
      },
    },
    async ({ rank }) =>
      runTool(async () => {
        const [rewardsByRank, rankingSettings] = await Promise.all([
          getGoData<GoBattleLeagueRewardsByRank>("gobattle_league_rewards"),
          getGoData<GoBattleRankingSettings>("gobattle_ranking_settings"),
        ]);

        if (rank !== undefined) {
          const entry = rewardsByRank[String(rank)];
          if (!entry) {
            throw new Error(
              `Rank ${rank} não encontrado. Ranks disponíveis: ${Object.keys(rewardsByRank).join(", ")}.`,
            );
          }
          return jsonResult({ rank, rewards: entry, ranking_settings: rankingSettings });
        }

        return jsonResult({ rewards_by_rank: rewardsByRank, ranking_settings: rankingSettings });
      }),
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-battle-league-info.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/go-types.ts src/tools/go-battle-league-info.ts src/tools/go-battle-league-info.test.ts
git commit -m "feat: add go_get_battle_league_info tool"
```

---

### Task 11: `go_get_raid_settings`

**Files:**
- Modify: `src/go-types.ts` (append `GoRaidSettings`)
- Create: `src/tools/go-raid-settings.ts`
- Test: `src/tools/go-raid-settings.test.ts`

**Interfaces:**
- Produces: `GoRaidSettings` in `src/go-types.ts`.
- Produces: `registerGoGetRaidSettingsTool(server)`.

- [ ] **Step 1: Append the type**

Append to `src/go-types.ts`:

```typescript

export interface GoRaidSettings {
  friend_invite_cooldown_duration: number;
  friend_invite_cutoff_time: number;
  friends_can_be_invited_in_person: boolean;
  friends_can_be_invited_remotely: boolean;
  max_friend_invites_per_invite: number;
  max_number_of_friend_invites: number;
  max_players_per_raid: number;
  max_remote_players_per_raid: number;
  max_remote_raid_passes: number;
  min_player_level_for_remote_raids: number;
  remote_damage_modifier: number;
  remote_raids_enabled: boolean;
  unsupported_remote_raid_levels: (string | number)[];
}
```

- [ ] **Step 2: Write the failing test**

Write `src/tools/go-raid-settings.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetRaidSettingsTool } from "./go-raid-settings.js";

test("go_get_raid_settings: remote_damage_modifier and player limits are sane numbers", async () => {
  const handler = captureToolHandler(registerGoGetRaidSettingsTool, "go_get_raid_settings");
  const result = await handler({});
  const body = parseToolJson(result);
  assert.ok(body.remote_damage_modifier > 0 && body.remote_damage_modifier <= 1);
  assert.ok(Number.isInteger(body.max_players_per_raid) && body.max_players_per_raid > 0);
  assert.ok(Number.isInteger(body.max_remote_players_per_raid) && body.max_remote_players_per_raid > 0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-raid-settings.js'`

- [ ] **Step 4: Implement the tool**

Write `src/tools/go-raid-settings.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoRaidSettings } from "../go-types.js";

export function registerGoGetRaidSettingsTool(server: McpServer) {
  server.registerTool(
    "go_get_raid_settings",
    {
      title: "Mecânicas gerais de raid no Pokémon GO",
      description:
        "Retorna as mecânicas gerais de raid: limites de convite/participação (presencial e remoto), nº " +
        "máximo de jogadores, e o modificador de dano remoto vs. presencial (fator único aplicado a todo " +
        "ataque remoto — não é uma tabela por número de jogadores). Não inclui timers de duração de batalha " +
        "de raid nem de eclosão de ovo — o endpoint só expõe cooldown/prazo de convite de amigo.",
      inputSchema: {},
    },
    async () =>
      runTool(async () => {
        const settings = await getGoData<GoRaidSettings>("raid_settings");
        return jsonResult(settings);
      }),
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-raid-settings.test.js`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add src/go-types.ts src/tools/go-raid-settings.ts src/tools/go-raid-settings.test.ts
git commit -m "feat: add go_get_raid_settings tool"
```

---

### Task 12: `go_get_friendship_levels`

**Files:**
- Modify: `src/go-types.ts` (append `GoFriendshipLevel`)
- Create: `src/tools/go-friendship-levels.ts`
- Test: `src/tools/go-friendship-levels.test.ts`

**Interfaces:**
- Produces: `GoFriendshipLevel` in `src/go-types.ts`.
- Produces: `registerGoGetFriendshipLevelsTool(server)`.

- [ ] **Step 1: Append the type**

Append to `src/go-types.ts`:

```typescript

export interface GoFriendshipLevel {
  friendship_level: number;
  name: string;
  friendship_points_required: number;
  xp_reward: number;
  attack_bonus: number;
  trading_discount: number;
  raid_ball_bonus: number;
  allowed_trades: string[];
}
```

- [ ] **Step 2: Write the failing test**

Write `src/tools/go-friendship-levels.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetFriendshipLevelsTool } from "./go-friendship-levels.js";

test("go_get_friendship_levels: friendship_points_required and attack_bonus strictly increase with tier", async () => {
  const handler = captureToolHandler(registerGoGetFriendshipLevelsTool, "go_get_friendship_levels");
  const result = await handler({});
  const body = parseToolJson(result);
  const levels = body.levels as any[];
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i].friendship_points_required > levels[i - 1].friendship_points_required);
    assert.ok(levels[i].attack_bonus >= levels[i - 1].attack_bonus);
  }
});

test("go_get_friendship_levels: filtering by tier name returns a single entry", async () => {
  const handler = captureToolHandler(registerGoGetFriendshipLevelsTool, "go_get_friendship_levels");
  const result = await handler({ tier: "Best Friend" });
  const body = parseToolJson(result);
  assert.equal(body.name, "Best Friend");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-friendship-levels.js'`

- [ ] **Step 4: Implement the tool**

Write `src/tools/go-friendship-levels.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoFriendshipLevel } from "../go-types.js";

export function registerGoGetFriendshipLevelsTool(server: McpServer) {
  server.registerTool(
    "go_get_friendship_levels",
    {
      title: "Tiers de amizade no Pokémon GO",
      description:
        "Retorna os tiers de amizade (Friend a Best Friend): pontos de amizade necessários, recompensa de " +
        "XP de treinador ao atingir o tier, bônus de ataque em gym/raid, desconto de trade e bônus de raid " +
        "ball. Informe 'tier' (nome, ex: 'Best Friend') pra um único tier, ou deixe em branco pra ver todos.",
      inputSchema: {
        tier: z.string().optional().describe("Nome do tier (ex: 'Friend', 'Good Friend', 'Best Friend')."),
      },
    },
    async ({ tier }) =>
      runTool(async () => {
        const levels = (await getGoData<GoFriendshipLevel[]>("friendship_level_settings")).sort(
          (a, b) => a.friendship_level - b.friendship_level,
        );

        if (tier === undefined) {
          return jsonResult({ levels });
        }

        const needle = tier.trim().toLowerCase();
        const match = levels.find((l) => l.name.toLowerCase() === needle);
        if (!match) {
          throw new Error(`Tier '${tier}' não encontrado. Tiers válidos: ${levels.map((l) => l.name).join(", ")}.`);
        }
        return jsonResult(match);
      }),
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-friendship-levels.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/go-types.ts src/tools/go-friendship-levels.ts src/tools/go-friendship-levels.test.ts
git commit -m "feat: add go_get_friendship_levels tool"
```

---

### Task 13: `go_get_shiny_events`

**Files:**
- Create: `src/tools/go-shiny-events.ts`
- Test: `src/tools/go-shiny-events.test.ts`

**Interfaces:**
- Consumes: `GoFormTaggedEntry` (added in Task 6).
- Produces: `registerGoGetShinyEventsTool(server)`.

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-shiny-events.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetShinyEventsTool } from "./go-shiny-events.js";

test("go_get_shiny_events: Ditto's shiny has been event/disguise-only for years", async () => {
  const handler = captureToolHandler(registerGoGetShinyEventsTool, "go_get_shiny_events");
  const result = await handler({});
  const body = parseToolJson(result);
  assert.ok(body.pokemon.some((p: any) => p.name === "Ditto"));
  assert.ok(typeof body.note === "string" && body.note.length > 0);
});

test("go_get_shiny_events: every entry has id, name and form", async () => {
  const handler = captureToolHandler(registerGoGetShinyEventsTool, "go_get_shiny_events");
  const result = await handler({});
  const body = parseToolJson(result);
  for (const p of body.pokemon) {
    assert.ok(typeof p.id === "number");
    assert.ok(typeof p.name === "string");
    assert.ok(typeof p.form === "string");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-shiny-events.js'`

- [ ] **Step 3: Implement the tool**

Write `src/tools/go-shiny-events.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoFormTaggedEntry } from "../go-types.js";

export function registerGoGetShinyEventsTool(server: McpServer) {
  server.registerTool(
    "go_get_shiny_events",
    {
      title: "Shinies restritos a evento no Pokémon GO",
      description:
        "Lista Pokémon cujo shiny só está disponível durante eventos (ou, no caso do Ditto, só quando " +
        "disfarçado de outra espécie) em vez de sempre ativo. O endpoint NÃO expõe datas/janela do evento — " +
        "só quais espécies estão nessa categoria.",
      inputSchema: {
        name_or_id: z.string().optional().describe("Filtra por substring do nome ou id numérico exato."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const all = await getGoData<GoFormTaggedEntry[]>("time_limited_shiny_pokemon");
        let pokemon = all;

        if (name_or_id !== undefined) {
          const trimmed = name_or_id.trim();
          if (/^\d+$/.test(trimmed)) {
            const id = Number(trimmed);
            pokemon = all.filter((p) => p.id === id);
          } else {
            const needle = trimmed.toLowerCase();
            pokemon = all.filter((p) => p.name.toLowerCase().includes(needle));
          }
        }

        return jsonResult({
          total: pokemon.length,
          pokemon,
          note: "A PoGo API não expõe data/janela do evento — só quais espécies têm shiny restrito.",
        });
      }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-shiny-events.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-shiny-events.ts src/tools/go-shiny-events.test.ts
git commit -m "feat: add go_get_shiny_events tool"
```

---

### Task 14: Wire all 13 tools into the server + update README

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: all 13 `registerGoGetXTool` functions from Tasks 1-13.

- [ ] **Step 1: Register all 13 tools in `src/index.ts`**

Add imports after the existing GO imports (after the `go-iv.js` import line):

```typescript
import { registerGoGetTypeEffectivenessTool } from "./tools/go-type-effectiveness.js";
import { registerGoGetWeatherBoostsTool } from "./tools/go-weather-boosts.js";
import { registerGoGetRegionalFormsTool } from "./tools/go-regional-forms.js";
import { registerGoGetShadowPokemonTool } from "./tools/go-shadow-pokemon.js";
import { registerGoGetMegaPokemonTool } from "./tools/go-mega-pokemon.js";
import { registerGoGetPokemonSourcesTool } from "./tools/go-pokemon-sources.js";
import { registerGoGetEncounterDataTool } from "./tools/go-encounter-data.js";
import { registerGoGetPowerupCostTool } from "./tools/go-powerup-cost.js";
import { registerGoGetTrainerProgressionTool } from "./tools/go-trainer-progression.js";
import { registerGoGetBattleLeagueInfoTool } from "./tools/go-battle-league-info.js";
import { registerGoGetRaidSettingsTool } from "./tools/go-raid-settings.js";
import { registerGoGetFriendshipLevelsTool } from "./tools/go-friendship-levels.js";
import { registerGoGetShinyEventsTool } from "./tools/go-shiny-events.js";
```

Add registration calls after the existing `registerGoEstimateIvTool(server);` line:

```typescript
registerGoGetTypeEffectivenessTool(server);
registerGoGetWeatherBoostsTool(server);
registerGoGetRegionalFormsTool(server);
registerGoGetShadowPokemonTool(server);
registerGoGetMegaPokemonTool(server);
registerGoGetPokemonSourcesTool(server);
registerGoGetEncounterDataTool(server);
registerGoGetPowerupCostTool(server);
registerGoGetTrainerProgressionTool(server);
registerGoGetBattleLeagueInfoTool(server);
registerGoGetRaidSettingsTool(server);
registerGoGetFriendshipLevelsTool(server);
registerGoGetShinyEventsTool(server);
```

- [ ] **Step 2: Add the 13 new rows to the "Tools disponíveis — Pokémon GO" table in `README.md`**

Insert after the existing `go_estimate_iv` row:

```markdown
| `go_get_type_effectiveness` | Multiplicadores de dano por tipo específicos do GO (sem imunidade real, diferente dos jogos principais) |
| `go_get_weather_boosts` | Clima → tipos boostados |
| `go_get_regional_forms` | Variantes regionais (Alola/Galar/Hisui/Paldea) disponíveis no GO |
| `go_get_shadow_pokemon` | Lista completa de Pokémon obteníveis como Shadow |
| `go_get_mega_pokemon` | Custo de energia e bônus de Mega Evolução |
| `go_get_pokemon_sources` | Canais de obtenção exclusivos de um Pokémon (nest, raid, PvP, pesquisa, baby, photobomb, disfarce de Ditto) |
| `go_get_encounter_data` | Probabilidade de ataque/esquiva durante o minigame de captura |
| `go_get_powerup_cost` | Custo de stardust/candy/XL candy por nível de power up |
| `go_get_trainer_progression` | Curva de XP por nível de treinador, recompensas de level up e badges |
| `go_get_battle_league_info` | Recompensas e requisitos de rank da GO Battle League |
| `go_get_raid_settings` | Limites de convite/participação e modificador de dano remoto em raids |
| `go_get_friendship_levels` | Tiers de amizade, pontos necessários e bônus |
| `go_get_shiny_events` | Pokémon com shiny restrito a evento |
```

- [ ] **Step 3: Rebuild and run the full test suite**

Run: `npm run build && npm test`
Expected: PASS — all 13 new test files (26 tests) green, no TypeScript errors.

- [ ] **Step 4: Verify live via the stub-invocation script**

Run: `node -e "
import('./dist/tools/go-type-effectiveness.js').then(async (m) => {
  const handlers = {};
  m.registerGoGetTypeEffectivenessTool({ registerTool: (n, _c, h) => { handlers[n] = h; } });
  const r = await handlers['go_get_type_effectiveness']({ attacking_type: 'ghost', defending_type: 'normal' });
  console.log(r.content[0].text);
});
"`
Expected: prints a JSON object with `"multiplier": 0.390625` (or similar nonzero value) — confirms the live server code path, not just the test file, works end to end.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts README.md
git commit -m "feat: register the 13 new PoGo leaf tools and document them in README"
```

---

## After this plan

The MCP server exposes 28 tools total (15 existing + 13 new). Reconnect the `pokemon` MCP server (exit and reopen Claude Code in this project) to see the new `mcp__pokemon__go_get_*` tools natively.

The 8 composite tools from `docs/pogo-tool-proposals.md` §3 are a separate plan (`docs/superpowers/plans/2026-07-19-pogo-composite-tools.md`) — they depend on refactoring 5 existing tool files to export reusable functions, which this plan intentionally does not touch.
