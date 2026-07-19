# PoGo Composite Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 8 composite MCP tools from `docs/pogo-tool-proposals.md` §3 — tools that call other tools' logic in-process to answer a task, not just fetch one endpoint.

**Architecture:** MCP has no server-to-self tool call, so "a tool calling other tools" means: extract each dependency's core logic into an exported plain `async` function (separate from its `registerXTool(server)` wrapper, which becomes a thin `jsonResult(await coreFunction(...))` call), then have composite tools import and call those functions directly. A shared `src/go-battle-math.ts` module holds the DPS/STAB/type-effectiveness math (Brok-approved, see below) so it's written once and reused by the two tools that need it.

**Damage-ranking formula (Brok-approved after 2 review rounds):** for ranking attackers against one fixed target, the target's Defense is a constant shared by every candidate in the same call — it scales every candidate's score equally and does not change the ranking order. So instead of sourcing an unverifiable boss-Defense constant (no PoGo API endpoint exposes it), the formula omits it and labels the output "relative ranking, not absolute damage." Attacker Attack **is** included (candidate-specific, standardized to level 40 / IV 15-15-15 — the convention GamePress/Pokebattler use to compare species) since it genuinely changes the ranking and was the real bug in the first draft. STAB is a hardcoded `1.2` constant (verified against GamePress/Bulbapedia, stable since Dec 2018, not exposed by any endpoint — same precedent as the CP formula already hardcoded in `src/go-utils.ts`). Exact formula:

```
attackStat(base_attack) = (base_attack + 15) * cpMultiplierAtLevel40   // CPM exponent 1, not squared — squaring is only correct for the CP formula itself
relativeDamagePerHit(move, attackerTypes, defenderTypes) =
  0.5 * move.power * attackStat * stab(move.type, attackerTypes) * typeEffectiveness(move.type, defenderTypes)
n = ceil(|chargedMove.energy_delta| / fastMove.energy_delta)
relativeDps = (n * relativeDamagePerHit(fastMove) + relativeDamagePerHit(chargedMove)) / ((n * fastMove.duration + chargedMove.duration) / 1000)
```

**No fabricated scores:** per Brok's review, no composite tool invents a single "best pick" or win-probability rating from arbitrary weights. Tools either (a) rank by the one real, documented metric above (relative DPS), or (b) report raw comparable facts side by side and let the caller judge (`go_pvp_matchup_analyzer`, `go_mega_raid_planner`'s "worth it" question, `go_shadow_purify_advisor`).

**Tech Stack:** TypeScript (strict, NodeNext), `@modelcontextprotocol/sdk`, `zod`, Node built-in `node:test`.

## Global Constraints

- **Prerequisite:** `docs/superpowers/plans/2026-07-19-pogo-leaf-tools.md` must be implemented first — Tasks 9, 15 and 16 below modify files that plan creates (`src/tools/go-mega-pokemon.ts`, `src/tools/go-regional-forms.ts`, `src/tools/go-pokemon-sources.ts`) and Task 8 depends on `GoTypeEffectivenessTable` from that plan's Task 1.
- Every refactor task (2-7) must not change the JSON shape any existing tool returns — verify with a test that calls the tool handler exactly as before and checks the same fields. These are refactors, not behavior changes.
- Composite tool files never call `getGoData` directly for data another tool already fetches and shapes — they call that tool's exported function. Composite tools MAY call `getGoData` directly only for data no leaf/existing tool exposes yet (e.g. raw `charged_moves.json` lookup for Frustration/Return in Task 13).
- Every composite tool's response includes a `methodology_note` (or equivalent) field whenever it computes a derived/relative metric, stating exactly what is and isn't modeled — never let a number appear without its caveat attached in the same payload.
- Same style/error-handling/test conventions as the leaf-tools plan (`runTool`, plain `Error` throws, `node --test`, `captureToolHandler`/`parseToolJson` from `src/test-helpers.js`).

---

### Task 1: `src/go-battle-math.ts` — shared DPS/STAB/type-effectiveness math

**Files:**
- Create: `src/go-battle-math.ts`
- Test: `src/go-battle-math.test.ts`

**Interfaces:**
- Consumes: `GoCpMultiplierEntry`, `GoTypeEffectivenessTable` (from `src/go-types.ts`; the latter added by the leaf-tools plan Task 1).
- Produces: `STAB_MULTIPLIER`, `getCpMultiplierAtLevel(level)`, `typeEffectiveness(moveType, defenderTypes, table)`, `stabMultiplier(moveType, attackerTypes)`, `relativeDamagePerHit(move, attackerTypes, attackStat, defenderTypes, table)`, `cycleRelativeDps(fastMove, chargedMove, attackerTypes, attackStat, defenderTypes, table)`, `METHODOLOGY_NOTE` — all consumed by Tasks 8 and 9.

- [ ] **Step 1: Write the failing tests (pure functions — no network needed)**

Write `src/go-battle-math.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cycleRelativeDps,
  relativeDamagePerHit,
  stabMultiplier,
  typeEffectiveness,
} from "./go-battle-math.js";

test("stabMultiplier: 1.2 when the move's type matches the attacker's, 1 otherwise", () => {
  assert.equal(stabMultiplier("Fire", ["Fire", "Flying"]), 1.2);
  assert.equal(stabMultiplier("Water", ["Fire", "Flying"]), 1);
});

test("typeEffectiveness: multiplies across a dual-type defender", () => {
  const table = { Fire: { Grass: 1.6, Water: 0.625 } };
  assert.equal(typeEffectiveness("Fire", ["Grass"], table), 1.6);
  assert.equal(typeEffectiveness("Fire", ["Grass", "Water"], table), 1.6 * 0.625);
});

test("relativeDamagePerHit: matches 0.5 * power * attackStat * stab * effectiveness", () => {
  const table = { Fire: { Grass: 1.6 } };
  const damage = relativeDamagePerHit({ power: 10, type: "Fire" }, ["Fire"], 100, ["Grass"], table);
  assert.equal(damage, 0.5 * 10 * 100 * 1.2 * 1.6);
});

test("cycleRelativeDps: matches the documented cycle formula", () => {
  const table = { Fire: { Grass: 1.6 } };
  const fastMove = { name: "Ember", power: 10, type: "Fire", duration: 1000, energy_delta: 10 };
  const chargedMove = { name: "Fire Blast", power: 100, type: "Fire", duration: 2000, energy_delta: -50 };
  const result = cycleRelativeDps(fastMove, chargedMove, ["Fire"], 100, ["Grass"], table);
  // n = ceil(50/10) = 5; fastDamage = 960; chargedDamage = 9600; cycleDamage = 5*960+9600 = 14400
  // cycleDuration = (5*1000+2000)/1000 = 7; dps = 14400/7
  assert.ok(Math.abs(result.relative_dps - 14400 / 7) < 1e-9);
  assert.equal(result.fast_move, "Ember");
  assert.equal(result.charged_move, "Fire Blast");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-battle-math.js'`

- [ ] **Step 3: Implement the module**

Write `src/go-battle-math.ts`:

```typescript
import { getGoData } from "./go-client.js";
import type { GoCpMultiplierEntry, GoTypeEffectivenessTable } from "./go-types.js";

/** Same-type attack bonus — stable Pokémon GO mechanic since Dec 2018. Not exposed by any PoGo API endpoint. */
export const STAB_MULTIPLIER = 1.2;

/** Standardized attacker level for cross-species ranking (GamePress/Pokebattler convention). */
export const RANKING_LEVEL = 40;
export const RANKING_IV = 15;

export async function getCpMultiplierAtLevel(level: number): Promise<number> {
  const table = await getGoData<GoCpMultiplierEntry[]>("cp_multiplier");
  const entry = table.find((e) => e.level === level);
  if (!entry) throw new Error(`Nível ${level} não suportado pela tabela de CP multiplier.`);
  return entry.multiplier;
}

/** (base_attack + IV) * CPM — CPM exponent 1 here; squaring only applies to the CP formula itself. */
export function attackStatAtLevel(baseAttack: number, cpMultiplier: number, iv = RANKING_IV): number {
  return (baseAttack + iv) * cpMultiplier;
}

export function typeEffectiveness(
  moveType: string,
  defenderTypes: string[],
  table: GoTypeEffectivenessTable,
): number {
  const row = table[moveType];
  if (!row) throw new Error(`Tipo de move '${moveType}' não encontrado na tabela de efetividade.`);
  return defenderTypes.reduce((acc, t) => acc * (row[t] ?? 1), 1);
}

export function stabMultiplier(moveType: string, attackerTypes: string[]): number {
  return attackerTypes.includes(moveType) ? STAB_MULTIPLIER : 1;
}

/**
 * Relative (not absolute) damage for one hit: proportional to the real GO damage formula
 * (0.5 * power * Attack/Defense * STAB * effectiveness) with the defender's Defense factored out —
 * for ranking candidates against one fixed target, Defense is shared by every candidate and does
 * not change the ranking order, only the absolute scale.
 */
export function relativeDamagePerHit(
  move: { power: number; type: string },
  attackerTypes: string[],
  attackStat: number,
  defenderTypes: string[],
  typeTable: GoTypeEffectivenessTable,
): number {
  return (
    0.5 *
    move.power *
    attackStat *
    stabMultiplier(move.type, attackerTypes) *
    typeEffectiveness(move.type, defenderTypes, typeTable)
  );
}

export interface CycleDpsResult {
  relative_dps: number;
  fast_move: string;
  charged_move: string;
}

interface CycleMove {
  name: string;
  power: number;
  type: string;
  duration: number;
  energy_delta: number;
}

/** Effective-DPS cycle: how many fast moves pay for one charged move, damage over that cycle's duration. */
export function cycleRelativeDps(
  fastMove: CycleMove,
  chargedMove: CycleMove,
  attackerTypes: string[],
  attackStat: number,
  defenderTypes: string[],
  typeTable: GoTypeEffectivenessTable,
): CycleDpsResult {
  const n = Math.ceil(Math.abs(chargedMove.energy_delta) / fastMove.energy_delta);
  const fastDamage = relativeDamagePerHit(fastMove, attackerTypes, attackStat, defenderTypes, typeTable);
  const chargedDamage = relativeDamagePerHit(chargedMove, attackerTypes, attackStat, defenderTypes, typeTable);
  const cycleRelativeDamage = n * fastDamage + chargedDamage;
  const cycleDurationSeconds = (n * fastMove.duration + chargedMove.duration) / 1000;
  return {
    relative_dps: cycleRelativeDamage / cycleDurationSeconds,
    fast_move: fastMove.name,
    charged_move: chargedMove.name,
  };
}

export const METHODOLOGY_NOTE =
  "Ranking relativo por DPS efetivo (Attack do atacante em nível 40/IV 15-15-15 incluído; Defense do alvo " +
  "não é modelado pois nenhum endpoint da PoGo API o expõe — como é uma constante compartilhada entre " +
  "candidatos na mesma chamada, isso não afeta a ORDEM do ranking, só a escala absoluta). Não considera " +
  "bulk/sobrevivência do atacante nem simula a batalha turno a turno.";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/go-battle-math.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/go-battle-math.ts src/go-battle-math.test.ts
git commit -m "feat: add shared relative-DPS battle math (Brok-approved formula)"
```

---

### Task 2: Refactor `go-pokemon.ts` to export `getGoPokemonProfile`

**Files:**
- Modify: `src/tools/go-pokemon.ts` (whole file)
- Test: `src/tools/go-pokemon.test.ts`

**Interfaces:**
- Produces: `getGoPokemonProfile(nameOrId, opts?)` — consumed by Tasks 8-15.

- [ ] **Step 1: Write the failing test (locks in current behavior before refactor)**

Write `src/tools/go-pokemon.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { getGoPokemonProfile } from "./go-pokemon.js";

test("getGoPokemonProfile: returns base stats, types and mega info for Garchomp", async () => {
  const profile = await getGoPokemonProfile("Garchomp");
  assert.equal(profile.name, "Garchomp");
  assert.deepEqual(profile.types, ["Dragon", "Ground"]);
  assert.ok(profile.base_stats && typeof (profile.base_stats as any).attack === "number");
});

test("getGoPokemonProfile: computes calculated_cp only when level is given", async () => {
  const withoutLevel = await getGoPokemonProfile("Garchomp");
  assert.equal(withoutLevel.calculated_cp, null);

  const withLevel = await getGoPokemonProfile("Garchomp", { level: 20 });
  assert.ok(withLevel.calculated_cp !== null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `getGoPokemonProfile` is not exported

- [ ] **Step 3: Refactor the file**

Replace the entire contents of `src/tools/go-pokemon.ts` with:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { calculateCp, pickNormalForm, resolveGoPokemon } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type {
  GoBuddyDistancesByKm,
  GoMaxCpEntry,
  GoMegaEntry,
  GoNamesById,
  GoRarityByClass,
  GoShinyById,
  GoStatsEntry,
  GoTypesEntry,
} from "../go-types.js";

export interface GoPokemonProfileOptions {
  level?: number;
  attack_iv?: number;
  defense_iv?: number;
  stamina_iv?: number;
}

export async function getGoPokemonProfile(nameOrId: string, opts: GoPokemonProfileOptions = {}) {
  const { level, attack_iv, defense_iv, stamina_iv } = opts;
  const { id, name } = await resolveGoPokemon(nameOrId);

  const [stats, types, rarity, released, shiny, maxCp, buddyDistances, megas, alolan, galarian, shadow] =
    await Promise.all([
      getGoData<GoStatsEntry[]>("pokemon_stats"),
      getGoData<GoTypesEntry[]>("pokemon_types"),
      getGoData<GoRarityByClass>("pokemon_rarity"),
      getGoData<GoNamesById>("released_pokemon"),
      getGoData<GoShinyById>("shiny_pokemon"),
      getGoData<GoMaxCpEntry[]>("pokemon_max_cp"),
      getGoData<GoBuddyDistancesByKm>("pokemon_buddy_distances"),
      getGoData<GoMegaEntry[]>("mega_pokemon"),
      getGoData<GoNamesById>("alolan_pokemon"),
      getGoData<GoNamesById>("galarian_pokemon"),
      getGoData<GoNamesById>("shadow_pokemon"),
    ]);

  const statsEntry = pickNormalForm(stats, id);
  const typesEntry = pickNormalForm(types, id);
  const maxCpEntry = pickNormalForm(maxCp, id);

  let rarityLabel: string | null = null;
  for (const [label, entries] of Object.entries(rarity)) {
    if (entries.some((e) => e.pokemon_id === id)) {
      rarityLabel = label;
      break;
    }
  }

  let buddyDistanceKm: number | null = null;
  for (const entries of Object.values(buddyDistances)) {
    const match = entries.find((e) => e.pokemon_id === id && e.form === "Normal");
    if (match) {
      buddyDistanceKm = match.distance;
      break;
    }
  }

  const megaForms = megas
    .filter((m) => m.pokemon_id === id)
    .map((m) => ({
      mega_name: m.mega_name,
      form: m.form,
      mega_energy_required: m.mega_energy_required,
      first_time_mega_energy_required: m.first_time_mega_energy_required,
      type: m.type,
      stats: m.stats,
    }));

  const shinyEntry = shiny[String(id)] ?? null;

  let calculated_cp: number | null = null;
  if (level !== undefined && statsEntry) {
    calculated_cp = await calculateCp(statsEntry, level, {
      attack: attack_iv ?? 15,
      defense: defense_iv ?? 15,
      stamina: stamina_iv ?? 15,
    });
  }

  return {
    id,
    name,
    released_in_go: Boolean(released[String(id)]),
    rarity: rarityLabel,
    types: typesEntry?.type ?? null,
    base_stats: statsEntry
      ? { attack: statsEntry.base_attack, defense: statsEntry.base_defense, stamina: statsEntry.base_stamina }
      : null,
    max_cp_at_level_40: maxCpEntry?.max_cp ?? null,
    calculated_cp:
      calculated_cp !== null
        ? { level, ivs: { attack: attack_iv ?? 15, defense: defense_iv ?? 15, stamina: stamina_iv ?? 15 }, cp: calculated_cp }
        : null,
    buddy_distance_km: buddyDistanceKm,
    shiny_availability: shinyEntry,
    mega_forms: megaForms,
    has_alolan_form: Boolean(alolan[String(id)]),
    has_galarian_form: Boolean(galarian[String(id)]),
    shadow_available: Boolean(shadow[String(id)]),
  };
}

export function registerGoGetPokemonTool(server: McpServer) {
  server.registerTool(
    "go_get_pokemon",
    {
      title: "Perfil de um Pokémon no Pokémon GO",
      description:
        "Retorna o perfil de um Pokémon especificamente no contexto do Pokémon GO: stats base (attack/defense/" +
        "stamina, escala diferente dos jogos principais), tipos, raridade, se já foi lançado no jogo, " +
        "disponibilidade de shiny (selvagem/raid/ovo/pesquisa/photobomb/evolução), CP máximo no nível 40, " +
        "distância de buddy para candy, formas regionais (Alolan/Galarian) e shadow disponíveis, e informações " +
        "de Mega Evolução (custo de energia, stats mega) quando existir. Opcionalmente informe 'level' (e IVs) " +
        "para calcular o CP real nesse nível.",
      inputSchema: {
        name_or_id: z.string().describe("Nome (ex: 'Pikachu') ou id numérico do Pokémon."),
        level: z
          .number()
          .min(1)
          .max(45)
          .optional()
          .describe("Nível (1 a 45, incrementos de 0.5) para calcular o CP real. Requer IVs opcionalmente."),
        attack_iv: z.number().int().min(0).max(15).optional().describe("IV de ataque (0-15). Padrão 15 (perfeito)."),
        defense_iv: z.number().int().min(0).max(15).optional().describe("IV de defesa (0-15). Padrão 15."),
        stamina_iv: z.number().int().min(0).max(15).optional().describe("IV de stamina (0-15). Padrão 15."),
      },
    },
    async ({ name_or_id, level, attack_iv, defense_iv, stamina_iv }) =>
      runTool(async () => jsonResult(await getGoPokemonProfile(name_or_id, { level, attack_iv, defense_iv, stamina_iv }))),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-pokemon.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Manually verify the registered tool is unchanged**

Run: `node -e "
import('./dist/tools/go-pokemon.js').then(async (m) => {
  const handlers = {};
  m.registerGoGetPokemonTool({ registerTool: (n, _c, h) => { handlers[n] = h; } });
  const r = await handlers['go_get_pokemon']({ name_or_id: 'Garchomp' });
  console.log(r.content[0].text.slice(0, 200));
});
"`
Expected: prints JSON starting with `{\n  "id": 445,\n  "name": "Garchomp",` — identical shape to before the refactor.

- [ ] **Step 6: Commit**

```bash
git add src/tools/go-pokemon.ts src/tools/go-pokemon.test.ts
git commit -m "refactor: extract getGoPokemonProfile from go_get_pokemon for reuse by composite tools"
```

---

### Task 3: Refactor `go-moves.ts` to export `getGoPokemonMoveset`

**Files:**
- Modify: `src/tools/go-moves.ts` (whole file)
- Test: `src/tools/go-moves.test.ts`

**Interfaces:**
- Produces: `getGoPokemonMoveset(nameOrId)`, `loadMoveTables()`, `buildFastMoveDetail(name, tables)`, `buildChargedMoveDetail(name, tables)` — consumed by Tasks 8, 9, 10, 11, 12, 14.

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-moves.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { getGoPokemonMoveset, loadMoveTables } from "./go-moves.js";

test("getGoPokemonMoveset: Machamp has at least one elite-only charged move", async () => {
  const moveset = await getGoPokemonMoveset("Machamp");
  assert.equal(moveset.pokemon, "Machamp");
  assert.ok(moveset.elite_only_charged_moves.length > 0);
});

test("loadMoveTables: returns all four move tables non-empty", async () => {
  const tables = await loadMoveTables();
  assert.ok(tables.fast.length > 0);
  assert.ok(tables.charged.length > 0);
  assert.ok(tables.pvpFast.length > 0);
  assert.ok(tables.pvpCharged.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `getGoPokemonMoveset` is not exported

- [ ] **Step 3: Refactor the file**

Replace the entire contents of `src/tools/go-moves.ts` with:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { resolveGoPokemon } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type {
  GoChargedMove,
  GoCurrentMovesEntry,
  GoFastMove,
  GoPvpChargedMove,
  GoPvpFastMove,
} from "../go-types.js";

export async function loadMoveTables() {
  const [fast, charged, pvpFast, pvpCharged] = await Promise.all([
    getGoData<GoFastMove[]>("fast_moves"),
    getGoData<GoChargedMove[]>("charged_moves"),
    getGoData<GoPvpFastMove[]>("pvp_fast_moves"),
    getGoData<GoPvpChargedMove[]>("pvp_charged_moves"),
  ]);
  return { fast, charged, pvpFast, pvpCharged };
}

export function buildFastMoveDetail(name: string, tables: Awaited<ReturnType<typeof loadMoveTables>>) {
  const raid = tables.fast.find((m) => m.name === name) ?? null;
  const pvp = tables.pvpFast.find((m) => m.name === name) ?? null;
  return { name, raid, pvp };
}

export function buildChargedMoveDetail(name: string, tables: Awaited<ReturnType<typeof loadMoveTables>>) {
  const raid = tables.charged.find((m) => m.name === name) ?? null;
  const pvp = tables.pvpCharged.find((m) => m.name === name) ?? null;
  return { name, raid, pvp };
}

export async function getGoPokemonMoveset(nameOrId: string) {
  const { id, name } = await resolveGoPokemon(nameOrId);
  const [movesList, tables] = await Promise.all([
    getGoData<GoCurrentMovesEntry[]>("current_pokemon_moves"),
    loadMoveTables(),
  ]);

  const entry = movesList.find((m) => m.pokemon_id === id && m.form === "Normal") ??
    movesList.find((m) => m.pokemon_id === id);

  if (!entry) {
    throw new Error(`Nenhum moveset encontrado para '${name}' no Pokémon GO.`);
  }

  return {
    pokemon: name,
    fast_moves: entry.fast_moves.map((m) => ({ ...buildFastMoveDetail(m, tables), elite: entry.elite_fast_moves.includes(m) })),
    elite_only_fast_moves: entry.elite_fast_moves
      .filter((m) => !entry.fast_moves.includes(m))
      .map((m) => ({ ...buildFastMoveDetail(m, tables), elite: true })),
    charged_moves: entry.charged_moves.map((m) => ({ ...buildChargedMoveDetail(m, tables), elite: entry.elite_charged_moves.includes(m) })),
    elite_only_charged_moves: entry.elite_charged_moves
      .filter((m) => !entry.charged_moves.includes(m))
      .map((m) => ({ ...buildChargedMoveDetail(m, tables), elite: true })),
  };
}

export function registerGoGetPokemonMovesTool(server: McpServer) {
  server.registerTool(
    "go_get_pokemon_moves",
    {
      title: "Moveset de um Pokémon no Pokémon GO",
      description:
        "Retorna o moveset atual de um Pokémon no Pokémon GO (fast moves e charged moves, incluindo os que só " +
        "são obtidos via Elite TM/evento legado), com os dados completos de cada move tanto para raids/PvE " +
        "(power, duration, energy_delta) quanto para PvP (power, turn_duration, energy_delta, buffs).",
      inputSchema: {
        name_or_id: z.string().describe("Nome (ex: 'Pikachu') ou id numérico do Pokémon."),
      },
    },
    async ({ name_or_id }) => runTool(async () => jsonResult(await getGoPokemonMoveset(name_or_id))),
  );
}

export function registerGoGetMoveTool(server: McpServer) {
  server.registerTool(
    "go_get_move",
    {
      title: "Detalhe de um move no Pokémon GO",
      description:
        "Retorna os dados completos de um move específico no Pokémon GO, tanto para o contexto de raids/PvE " +
        "(power, duration, energy_delta) quanto para PvP (power, turn_duration, energy_delta, buffs de stat).",
      inputSchema: {
        name: z.string().describe("Nome do move (ex: 'Thunderbolt', 'Frenzy Plant')."),
      },
    },
    async ({ name }) =>
      runTool(async () => {
        const tables = await loadMoveTables();
        const needle = name.trim().toLowerCase();

        const fastMatch = tables.fast.find((m) => m.name.toLowerCase() === needle);
        if (fastMatch) return jsonResult(buildFastMoveDetail(fastMatch.name, tables));

        const chargedMatch = tables.charged.find((m) => m.name.toLowerCase() === needle);
        if (chargedMatch) return jsonResult(buildChargedMoveDetail(chargedMatch.name, tables));

        throw new Error(`Move '${name}' não encontrado nos dados do Pokémon GO.`);
      }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-moves.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-moves.ts src/tools/go-moves.test.ts
git commit -m "refactor: export getGoPokemonMoveset and move-table helpers for reuse by composite tools"
```

---

### Task 4: Refactor `go-evolution.ts` to export `getGoEvolutionChain`

**Files:**
- Modify: `src/tools/go-evolution.ts` (whole file)
- Test: `src/tools/go-evolution.test.ts`

**Interfaces:**
- Produces: `getGoEvolutionChain(nameOrId)` — consumed by Tasks 10, 11.

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-evolution.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { getGoEvolutionChain } from "./go-evolution.js";

test("getGoEvolutionChain: Magikarp's chain reaches Gyarados with a 400-candy condition", async () => {
  const result = await getGoEvolutionChain("Magikarp");
  assert.equal(result.chain.species, "Magikarp");
  assert.equal(result.chain.evolves_to.length, 1);
  assert.equal(result.chain.evolves_to[0].species, "Gyarados");
  assert.ok(result.chain.evolves_to[0].condition.includes("400 candy"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `getGoEvolutionChain` is not exported

- [ ] **Step 3: Refactor the file**

Replace the entire contents of `src/tools/go-evolution.ts` with:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { resolveGoPokemon } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoEvolutionCondition, GoEvolutionsEntry } from "../go-types.js";

function describeCondition(ev: GoEvolutionCondition): string {
  const parts: string[] = [];
  if (ev.candy_required) parts.push(`${ev.candy_required} candy`);
  if (ev.item_required) parts.push(`usando '${ev.item_required}'`);
  if (ev.lure_required) parts.push(`perto de um '${ev.lure_required}' ativo`);
  if (ev.buddy_distance_required) parts.push(`tendo andado ${ev.buddy_distance_required}km como buddy`);
  if (ev.must_be_buddy_to_evolve) parts.push("precisa ser o buddy atual no momento da evolução");
  if (ev.only_evolves_in_daytime) parts.push("apenas durante o dia");
  if (ev.only_evolves_in_nighttime) parts.push("apenas durante a noite");
  if (ev.gender_required) parts.push(`apenas gênero '${ev.gender_required}'`);
  if (ev.no_candy_cost_if_traded) parts.push("sem custo de candy se for um Pokémon trocado");
  if (ev.upside_down) parts.push("com o dispositivo de cabeça para baixo");
  return parts.length > 0 ? parts.join(", ") : "sem condições especiais além de estar disponível";
}

function buildNode(
  id: number,
  byId: Map<number, GoEvolutionsEntry>,
  fallbackName: string,
): Record<string, unknown> {
  const entry = byId.get(id);
  const species = entry?.pokemon_name ?? fallbackName;
  if (!entry || entry.evolutions.length === 0) {
    return { species, evolves_to: [] };
  }

  return {
    species,
    evolves_to: entry.evolutions.map((ev) => ({
      condition: describeCondition(ev),
      ...buildNode(ev.pokemon_id, byId, ev.pokemon_name),
    })),
  };
}

export async function getGoEvolutionChain(nameOrId: string) {
  const { id } = await resolveGoPokemon(nameOrId);
  const all = await getGoData<GoEvolutionsEntry[]>("pokemon_evolutions");

  const byId = new Map<number, GoEvolutionsEntry>();
  const parentOf = new Map<number, number>();
  for (const entry of all) {
    if (entry.form !== "Normal") continue;
    byId.set(entry.pokemon_id, entry);
    for (const ev of entry.evolutions) {
      parentOf.set(ev.pokemon_id, entry.pokemon_id);
    }
  }

  let rootId = id;
  const seen = new Set<number>();
  while (parentOf.has(rootId) && !seen.has(rootId)) {
    seen.add(rootId);
    rootId = parentOf.get(rootId)!;
  }

  const rootEntry = byId.get(rootId);
  const tree = buildNode(rootId, byId, rootEntry?.pokemon_name ?? nameOrId);
  return { base_species_id: rootId, chain: tree };
}

export function registerGoGetEvolutionTool(server: McpServer) {
  server.registerTool(
    "go_get_evolution",
    {
      title: "Cadeia de evolução no Pokémon GO",
      description:
        "Retorna a árvore de evolução de um Pokémon com as regras específicas do Pokémon GO: quantidade de " +
        "candy, item necessário (ex: 'Metal Coat'), lure module necessário, distância andada como buddy, se " +
        "precisa ser o buddy no momento, restrição de horário (dia/noite) e de gênero. Diferente dos jogos " +
        "principais, no GO não há evolução por nível — é sempre candy (+ opcionalmente uma condição extra).",
      inputSchema: {
        name_or_id: z.string().describe("Nome ou id de qualquer Pokémon da cadeia (não precisa ser o estágio base)."),
      },
    },
    async ({ name_or_id }) => runTool(async () => jsonResult(await getGoEvolutionChain(name_or_id))),
  );
}
```

Note: the `buildNode` fallback for the root species name changed from the original inline `name` (the resolved input's own name) to `rootEntry?.pokemon_name ?? nameOrId` — equivalent in every case where the root has an entry (the common case), and only differs if the root species is missing from `pokemon_evolutions.json` entirely, in which case it now falls back to the raw input string instead of the resolved canonical name. This is a negligible edge case (every base-stage species has an entry, even ones with zero evolutions) — call it out in the PR description, not worth a special-case branch.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-evolution.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-evolution.ts src/tools/go-evolution.test.ts
git commit -m "refactor: extract getGoEvolutionChain from go_get_evolution for reuse by composite tools"
```

---

### Task 5: Refactor `go-raids.ts` to export `listGoRaidBosses`

**Files:**
- Modify: `src/tools/go-raids.ts` (whole file)
- Test: `src/tools/go-raids.test.ts`

**Interfaces:**
- Produces: `listGoRaidBosses(filters)` — consumed by Tasks 8, 9.

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-raids.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { listGoRaidBosses } from "./go-raids.js";

test("listGoRaidBosses: filtering by tier only returns that tier's current bosses", async () => {
  const result = await listGoRaidBosses({ tier: "5" });
  assert.ok(result.bosses.every((b: any) => String(b.tier) === "5"));
  assert.ok(result.bosses.every((b: any) => b.rotation === "current"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `listGoRaidBosses` is not exported

- [ ] **Step 3: Refactor the file**

Replace the entire contents of `src/tools/go-raids.ts` with:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoRaidBoss, GoRaidBosses } from "../go-types.js";

export interface ListGoRaidBossesFilters {
  tier?: string;
  name?: string;
  include_previous?: boolean;
}

export async function listGoRaidBosses(filters: ListGoRaidBossesFilters = {}) {
  const { tier, name, include_previous } = filters;
  const data = await getGoData<GoRaidBosses>("raid_bosses");
  const needle = name?.trim().toLowerCase();

  function collect(byTier: Record<string, GoRaidBoss[]>): (GoRaidBoss & { rotation: string })[] {
    const rotation = byTier === data.current ? "current" : "previous";
    const tiers = tier ? [tier] : Object.keys(byTier);
    const results: (GoRaidBoss & { rotation: string })[] = [];
    for (const t of tiers) {
      const bosses = byTier[t] ?? [];
      for (const boss of bosses) {
        if (needle && !boss.name.toLowerCase().includes(needle)) continue;
        results.push({ ...boss, rotation });
      }
    }
    return results;
  }

  const bosses = [...collect(data.current), ...(include_previous ? collect(data.previous) : [])];
  return { total: bosses.length, bosses };
}

export function registerGoGetRaidBossesTool(server: McpServer) {
  server.registerTool(
    "go_get_raid_bosses",
    {
      title: "Raid bosses do Pokémon GO",
      description:
        "Lista os raid bosses atuais (ou anteriores) do Pokémon GO, com tier, tipos, chance de shiny, clima " +
        "que dá boost, e faixas de CP (com e sem boost de clima) tanto para o boss quanto para captura. " +
        "Filtre por tier ('1'..'6', 'ex', 'mega', 'mega_legendary') e/ou por nome do Pokémon.",
      inputSchema: {
        tier: z.string().optional().describe("Filtra por tier: '1', '2', '3', '4', '5', '6', 'ex', 'mega' ou 'mega_legendary'."),
        name: z.string().optional().describe("Filtra por substring do nome do Pokémon (case-insensitive)."),
        include_previous: z.boolean().optional().describe("Se true, inclui também a rotação anterior de bosses (padrão: só a atual)."),
      },
    },
    async ({ tier, name, include_previous }) =>
      runTool(async () => jsonResult(await listGoRaidBosses({ tier, name, include_previous }))),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-raids.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-raids.ts src/tools/go-raids.test.ts
git commit -m "refactor: extract listGoRaidBosses from go_get_raid_bosses for reuse by composite tools"
```

---

### Task 6: Refactor `go-community-days.ts` to export `listGoCommunityDays`

**Files:**
- Modify: `src/tools/go-community-days.ts` (whole file)
- Test: `src/tools/go-community-days.test.ts`

**Interfaces:**
- Produces: `listGoCommunityDays(filters)` — consumed by Task 10.

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-community-days.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { listGoCommunityDays } from "./go-community-days.js";

test("listGoCommunityDays: limit:1 returns exactly the single most recent event", async () => {
  const all = await listGoCommunityDays({ limit: 100 });
  const mostRecent = await listGoCommunityDays({ limit: 1 });
  assert.equal(mostRecent.events.length, 1);
  assert.equal(mostRecent.events[0].start_date, all.events[0].start_date);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `listGoCommunityDays` is not exported

- [ ] **Step 3: Refactor the file**

Replace the entire contents of `src/tools/go-community-days.ts` with:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoCommunityDay } from "../go-types.js";

export interface ListGoCommunityDaysFilters {
  pokemon?: string;
  limit?: number;
}

export async function listGoCommunityDays(filters: ListGoCommunityDaysFilters = {}) {
  const { pokemon, limit } = filters;
  const all = await getGoData<GoCommunityDay[]>("community_days");
  const needle = pokemon?.trim().toLowerCase();

  let filtered = all;
  if (needle) {
    filtered = all.filter(
      (e) =>
        e.boosted_pokemon.some((p) => p.toLowerCase().includes(needle)) ||
        e.event_moves.some((m) => m.pokemon.toLowerCase().includes(needle)),
    );
  }

  const sorted = [...filtered].sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  const max = limit ?? 10;

  return { total_matches: sorted.length, returned: Math.min(max, sorted.length), events: sorted.slice(0, max) };
}

export function registerGoGetCommunityDaysTool(server: McpServer) {
  server.registerTool(
    "go_get_community_days",
    {
      title: "Histórico de Community Days do Pokémon GO",
      description:
        "Lista eventos de Community Day do Pokémon GO (data, bônus, Pokémon em destaque e move exclusivo " +
        "liberado no evento). Filtre por nome de Pokémon para ver em quais Community Days ele apareceu, ou " +
        "deixe em branco para ver os mais recentes.",
      inputSchema: {
        pokemon: z.string().optional().describe("Filtra Community Days em que este Pokémon foi destaque ou ganhou move exclusivo."),
        limit: z.number().int().min(1).max(100).optional().describe("Máximo de eventos retornados (padrão 10, mais recentes primeiro)."),
      },
    },
    async ({ pokemon, limit }) => runTool(async () => jsonResult(await listGoCommunityDays({ pokemon, limit }))),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-community-days.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-community-days.ts src/tools/go-community-days.test.ts
git commit -m "refactor: extract listGoCommunityDays from go_get_community_days for reuse by composite tools"
```

---

### Task 7: Refactor `go-iv.ts` to export `estimateGoIv`

**Files:**
- Modify: `src/tools/go-iv.ts` (whole file)
- Test: `src/tools/go-iv.test.ts`

**Interfaces:**
- Produces: `estimateGoIv(nameOrId, cp, hp, level?, stardust_cost?)` — consumed by Task 14.

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-iv.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateGoIv } from "./go-iv.js";

test("estimateGoIv: an unambiguous CP/HP pair with a known level resolves to exactly one match", async () => {
  const result = await estimateGoIv("Gabite", 1064, 109, undefined, 2500);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].level, 20);
  assert.equal(result.matches[0].attack_iv, 15);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `estimateGoIv` is not exported

- [ ] **Step 3: Refactor the file**

Replace the entire contents of `src/tools/go-iv.ts` with:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { estimateIvCombos, pickNormalForm, resolveCandidateLevels, resolveGoPokemon } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoStatsEntry } from "../go-types.js";

export async function estimateGoIv(nameOrId: string, cp: number, hp: number, level?: number, stardust_cost?: number) {
  const { id, name } = await resolveGoPokemon(nameOrId);
  const stats = await getGoData<GoStatsEntry[]>("pokemon_stats");
  const statsEntry = pickNormalForm(stats, id);
  if (!statsEntry) {
    throw new Error(`Stats não encontrados para '${name}' no Pokémon GO.`);
  }

  const candidateLevels = await resolveCandidateLevels(level, stardust_cost);
  const matches = await estimateIvCombos(statsEntry, candidateLevels, cp, hp);

  if (matches.length === 0) {
    throw new Error(
      `Nenhuma combinação de IV encontrada para '${name}' com CP ${cp} e HP ${hp} nos níveis testados. ` +
        `Confira se os números foram lidos corretamente na tela de detalhes do Pokémon (não na tela de apreciação).`,
    );
  }

  return {
    pokemon: name,
    cp,
    hp,
    ambiguous_levels: level === undefined && stardust_cost === undefined,
    note:
      level === undefined && stardust_cost === undefined
        ? "Nenhum 'level' ou 'stardust_cost' foi informado — os resultados abaixo cobrem todos os níveis possíveis e podem ser ambíguos. Informe um dos dois para um resultado preciso."
        : null,
    matches,
  };
}

export function registerGoEstimateIvTool(server: McpServer) {
  server.registerTool(
    "go_estimate_iv",
    {
      title: "Estima o IV de um Pokémon do Pokémon GO a partir de CP + HP",
      description:
        "Calcula quais combinações de IV (Attack/Defense/Stamina, 0-15 cada) são compatíveis com o CP e HP " +
        "observados de um Pokémon no Pokémon GO — o mesmo método usado por apps como PokeGenie/GoIV/Calcy IV. " +
        "Leia CP e HP na tela de detalhes do Pokémon (não na tela de apreciação com barras, que só dá uma " +
        "faixa aproximada). Informe 'level' se souber, ou 'stardust_cost' (o custo mostrado no botão de Power " +
        "Up) para restringir a 1-2 níveis candidatos — sem nenhum dos dois, o resultado pode incluir várias " +
        "combinações em níveis diferentes, todas matematicamente válidas mas ambíguas. LIMITAÇÃO: a fonte de " +
        "dados (PoGo API) só cobre níveis 1 a 45 — Pokémon nível 45.5+ (comum em Master League com XL candy " +
        "ou Best Buddy) não podem ser calculados por esta tool.",
      inputSchema: {
        name_or_id: z.string().describe("Nome (ex: 'Pikachu') ou id numérico do Pokémon."),
        cp: z.number().int().min(10).describe("CP observado do Pokémon."),
        hp: z.number().int().min(1).describe("HP máximo observado do Pokémon."),
        level: z
          .number()
          .min(1)
          .max(45)
          .optional()
          .describe("Nível do Pokémon, se conhecido (1 a 45, incrementos de 0.5 — a fonte de dados não cobre níveis acima de 45). Torna o resultado exato."),
        stardust_cost: z.number().int().optional().describe("Custo de stardust mostrado no botão de Power Up — restringe a busca a 1-2 níveis candidatos."),
      },
    },
    async ({ name_or_id, cp, hp, level, stardust_cost }) =>
      runTool(async () => jsonResult(await estimateGoIv(name_or_id, cp, hp, level, stardust_cost))),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-iv.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-iv.ts src/tools/go-iv.test.ts
git commit -m "refactor: extract estimateGoIv from go_estimate_iv for reuse by composite tools"
```

---

### Task 8: `go_raid_counter_guide`

**Files:**
- Create: `src/tools/go-raid-counter-guide.ts`
- Test: `src/tools/go-raid-counter-guide.test.ts`

**Interfaces:**
- Consumes: `listGoRaidBosses` (Task 5), `cycleRelativeDps`, `attackStatAtLevel`, `getCpMultiplierAtLevel`, `RANKING_LEVEL`, `METHODOLOGY_NOTE` (Task 1), `GoStatsEntry`, `GoTypesEntry`, `GoCurrentMovesEntry`, `GoFastMove`, `GoChargedMove`, `GoTypeEffectivenessTable`, `GoNamesById` (`src/go-types.ts`).
- Produces: `rankRaidCounters(defenderTypes, maxResults, excludePokemonId?)` — consumed by Task 9. `registerGoGetRaidCounterGuideTool(server)`.

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-raid-counter-guide.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetRaidCounterGuideTool, rankRaidCounters } from "./go-raid-counter-guide.js";

test("rankRaidCounters: a Water-type attacker outranks a Water-type target's weak matchups", async () => {
  const counters = await rankRaidCounters(["Ground"], 5);
  assert.equal(counters.length, 5);
  for (let i = 1; i < counters.length; i++) {
    assert.ok(counters[i - 1].relative_dps >= counters[i].relative_dps);
  }
});

test("go_raid_counter_guide: returns counters and a methodology_note for the current raid boss", async () => {
  const handler = captureToolHandler(registerGoGetRaidCounterGuideTool, "go_raid_counter_guide");
  const raids = await import("./go-raids.js");
  const current = await raids.listGoRaidBosses({});
  if (current.bosses.length === 0) return; // nothing in rotation right now — nothing to assert
  const bossName = current.bosses[0].name;

  const result = await handler({ boss_name: bossName, max_results: 3 });
  const body = parseToolJson(result);
  assert.equal(body.boss.name, bossName);
  assert.equal(body.counters.length, 3);
  assert.ok(typeof body.methodology_note === "string" && body.methodology_note.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-raid-counter-guide.js'`

- [ ] **Step 3: Implement the tool**

Write `src/tools/go-raid-counter-guide.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { attackStatAtLevel, cycleRelativeDps, getCpMultiplierAtLevel, METHODOLOGY_NOTE, RANKING_LEVEL } from "../go-battle-math.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { listGoRaidBosses } from "./go-raids.js";
import type {
  GoChargedMove,
  GoCurrentMovesEntry,
  GoFastMove,
  GoNamesById,
  GoStatsEntry,
  GoTypeEffectivenessTable,
  GoTypesEntry,
} from "../go-types.js";

export interface RaidCounter {
  pokemon_name: string;
  types: string[];
  fast_move: string;
  charged_move: string;
  relative_dps: number;
}

export async function rankRaidCounters(
  defenderTypes: string[],
  maxResults: number,
  excludePokemonId?: number,
): Promise<RaidCounter[]> {
  const [stats, types, moves, fastTable, chargedTable, released, typeTable, cpm40] = await Promise.all([
    getGoData<GoStatsEntry[]>("pokemon_stats"),
    getGoData<GoTypesEntry[]>("pokemon_types"),
    getGoData<GoCurrentMovesEntry[]>("current_pokemon_moves"),
    getGoData<GoFastMove[]>("fast_moves"),
    getGoData<GoChargedMove[]>("charged_moves"),
    getGoData<GoNamesById>("released_pokemon"),
    getGoData<GoTypeEffectivenessTable>("type_effectiveness"),
    getCpMultiplierAtLevel(RANKING_LEVEL),
  ]);

  const typesById = new Map(types.filter((t) => t.form === "Normal").map((t) => [t.pokemon_id, t.type]));
  const movesById = new Map(moves.filter((m) => m.form === "Normal").map((m) => [m.pokemon_id, m]));
  const fastByName = new Map(fastTable.map((m) => [m.name, m]));
  const chargedByName = new Map(chargedTable.map((m) => [m.name, m]));

  const candidates: RaidCounter[] = [];

  for (const stat of stats) {
    if (stat.form !== "Normal") continue;
    if (stat.pokemon_id === excludePokemonId) continue;
    if (!released[String(stat.pokemon_id)]) continue;

    const attackerTypes = typesById.get(stat.pokemon_id);
    const moveEntry = movesById.get(stat.pokemon_id);
    if (!attackerTypes || !moveEntry) continue;

    const attackStat = attackStatAtLevel(stat.base_attack, cpm40);
    const fastNames = [...new Set([...moveEntry.fast_moves, ...moveEntry.elite_fast_moves])];
    const chargedNames = [...new Set([...moveEntry.charged_moves, ...moveEntry.elite_charged_moves])];

    let best: RaidCounter | null = null;
    for (const fastName of fastNames) {
      const fastMove = fastByName.get(fastName);
      if (!fastMove) continue;
      for (const chargedName of chargedNames) {
        const chargedMove = chargedByName.get(chargedName);
        if (!chargedMove) continue;

        const cycle = cycleRelativeDps(fastMove, chargedMove, attackerTypes, attackStat, defenderTypes, typeTable);
        if (!best || cycle.relative_dps > best.relative_dps) {
          best = {
            pokemon_name: stat.pokemon_name,
            types: attackerTypes,
            fast_move: cycle.fast_move,
            charged_move: cycle.charged_move,
            relative_dps: cycle.relative_dps,
          };
        }
      }
    }
    if (best) candidates.push(best);
  }

  candidates.sort((a, b) => b.relative_dps - a.relative_dps);
  return candidates.slice(0, maxResults);
}

export function registerGoGetRaidCounterGuideTool(server: McpServer) {
  server.registerTool(
    "go_raid_counter_guide",
    {
      title: "Guia de counters pro raid boss atual",
      description:
        "Ranqueia os melhores atacantes contra um raid boss atual, por DPS relativo (fórmula real de dano do " +
        "GO — power, Attack padronizado em nível 40/IV 15, STAB, efetividade de tipo — com o Defense do boss " +
        "fatorado fora por não ter fonte na PoGo API; não muda a ordem do ranking, só a escala). Não considera " +
        "bulk/sobrevivência nem simula a batalha turno a turno — ver 'methodology_note' na resposta.",
      inputSchema: {
        boss_name: z.string().describe("Nome (substring, case-insensitive) do raid boss atual."),
        max_results: z.number().int().min(1).max(50).optional().describe("Quantos counters retornar (padrão 10)."),
      },
    },
    async ({ boss_name, max_results }) =>
      runTool(async () => {
        const { bosses } = await listGoRaidBosses({ name: boss_name });
        if (bosses.length === 0) {
          throw new Error(`Nenhum raid boss atual encontrado com o nome '${boss_name}'.`);
        }
        const boss = bosses[0];

        const counters = await rankRaidCounters(boss.type, max_results ?? 10);

        return jsonResult({
          boss: { name: boss.name, tier: boss.tier, types: boss.type },
          counters,
          methodology_note: METHODOLOGY_NOTE,
        });
      }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-raid-counter-guide.test.js`
Expected: PASS (2 tests) — this test hits the network for both bulk data and the current raid rotation; if raid rotation is empty, the second test no-ops rather than failing (documented volatile-data handling).

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-raid-counter-guide.ts src/tools/go-raid-counter-guide.test.ts
git commit -m "feat: add go_raid_counter_guide tool (Brok-approved relative-DPS ranking)"
```

---

### Task 9: `go_mega_raid_planner`

**Files:**
- Modify: `src/tools/go-mega-pokemon.ts` (export `getMegaInfo`, created in the leaf-tools plan Task 5)
- Create: `src/tools/go-mega-raid-planner.ts`
- Test: `src/tools/go-mega-raid-planner.test.ts`

**Interfaces:**
- Consumes: `rankRaidCounters` (Task 8), `listGoRaidBosses` (Task 5), `getMegaInfo` (this task's own refactor).
- Produces: `getMegaInfo(nameOrId?)` in `go-mega-pokemon.ts`. `registerGoGetMegaRaidPlannerTool(server)`.

- [ ] **Step 1: Refactor `go-mega-pokemon.ts` to export its core logic**

Replace the body of `registerGoGetMegaPokemonTool` in `src/tools/go-mega-pokemon.ts` (written in the leaf-tools plan Task 5) so the whole file reads:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { resolveGoPokemon } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoMegaEntry, GoMegaEvolutionSettings } from "../go-types.js";

export async function getMegaInfo(nameOrId?: string) {
  const [settings, allMegas] = await Promise.all([
    getGoData<GoMegaEvolutionSettings>("mega_evolution_settings"),
    getGoData<GoMegaEntry[]>("mega_pokemon"),
  ]);

  let megaForms = allMegas;
  if (nameOrId !== undefined) {
    const { id } = await resolveGoPokemon(nameOrId);
    megaForms = allMegas.filter((m) => m.pokemon_id === id);
  }

  return { settings, mega_forms: megaForms };
}

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
    async ({ name_or_id }) => runTool(async () => jsonResult(await getMegaInfo(name_or_id))),
  );
}
```

- [ ] **Step 2: Write the failing test**

Write `src/tools/go-mega-raid-planner.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetMegaRaidPlannerTool } from "./go-mega-raid-planner.js";
import { listGoRaidBosses } from "./go-raids.js";

test("go_mega_raid_planner: reports counters and mega info without asserting whether it's 'worth it'", async () => {
  const megaBosses = await listGoRaidBosses({ tier: "mega" });
  if (megaBosses.bosses.length === 0) return; // no mega raid in rotation right now — nothing to assert
  const bossName = megaBosses.bosses[0].name;

  const handler = captureToolHandler(registerGoGetMegaRaidPlannerTool, "go_mega_raid_planner");
  const result = await handler({ boss_name: bossName, max_results: 3 });
  const body = parseToolJson(result);
  assert.equal(body.boss.name, bossName);
  assert.equal(body.counters.length, 3);
  assert.ok(body.mega_info.settings.same_type_attack_boost === 1.3);
  assert.equal(body.verdict, undefined); // must never fabricate a "worth it" judgment
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-mega-raid-planner.js'`

- [ ] **Step 4: Implement the tool**

Write `src/tools/go-mega-raid-planner.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { METHODOLOGY_NOTE } from "../go-battle-math.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { getMegaInfo } from "./go-mega-pokemon.js";
import { listGoRaidBosses } from "./go-raids.js";
import { rankRaidCounters } from "./go-raid-counter-guide.js";

export function registerGoGetMegaRaidPlannerTool(server: McpServer) {
  server.registerTool(
    "go_mega_raid_planner",
    {
      title: "Planejador de mega raid no Pokémon GO",
      description:
        "Pra uma mega raid atual (tier 'mega' ou 'mega_legendary'), devolve os melhores counters (mesmo " +
        "ranking de DPS relativo de 'go_raid_counter_guide') e os dados factuais de mega evolução (custo de " +
        "energia 1ª vez/recorrente, bônus de batalha). NÃO afirma se vale a pena gastar energia mega agora — " +
        "só entrega os números pra você decidir.",
      inputSchema: {
        boss_name: z.string().describe("Nome (substring, case-insensitive) do mega raid boss atual."),
        max_results: z.number().int().min(1).max(50).optional().describe("Quantos counters retornar (padrão 10)."),
      },
    },
    async ({ boss_name, max_results }) =>
      runTool(async () => {
        const megaTier = await listGoRaidBosses({ tier: "mega", name: boss_name });
        const megaLegendaryTier = await listGoRaidBosses({ tier: "mega_legendary", name: boss_name });
        const boss = megaTier.bosses[0] ?? megaLegendaryTier.bosses[0];
        if (!boss) {
          throw new Error(`Nenhuma mega raid atual encontrada com o nome '${boss_name}'.`);
        }

        const [counters, megaInfo] = await Promise.all([
          rankRaidCounters(boss.type, max_results ?? 10),
          getMegaInfo(boss.name),
        ]);

        return jsonResult({
          boss: { name: boss.name, tier: boss.tier, types: boss.type },
          counters,
          mega_info: megaInfo,
          methodology_note: METHODOLOGY_NOTE,
        });
      }),
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-mega-raid-planner.test.js`
Expected: PASS (1 test, or a no-op skip if no mega raid is currently in rotation)

- [ ] **Step 6: Commit**

```bash
git add src/tools/go-mega-pokemon.ts src/tools/go-mega-raid-planner.ts src/tools/go-mega-raid-planner.test.ts
git commit -m "feat: add go_mega_raid_planner tool, reusing the raid counter ranking"
```

---

### Task 10: `go_community_day_prep`

**Files:**
- Create: `src/tools/go-community-day-prep.ts`
- Test: `src/tools/go-community-day-prep.test.ts`

**Interfaces:**
- Consumes: `listGoCommunityDays` (Task 6), `getGoPokemonProfile` (Task 2), `getGoPokemonMoveset` (Task 3), `getGoEvolutionChain` (Task 4).

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-community-day-prep.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetCommunityDayPrepTool } from "./go-community-day-prep.js";

test("go_community_day_prep: returns a profile and moveset for every boosted Pokémon in the latest event", async () => {
  const handler = captureToolHandler(registerGoGetCommunityDayPrepTool, "go_community_day_prep");
  const result = await handler({});
  const body = parseToolJson(result);
  assert.ok(body.community_day.boosted_pokemon.length > 0);
  assert.equal(body.pokemon.length, body.community_day.boosted_pokemon.length);
  for (const p of body.pokemon) {
    assert.ok(p.profile.base_stats);
    assert.ok(Array.isArray(p.moveset.fast_moves));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-community-day-prep.js'`

- [ ] **Step 3: Implement the tool**

Write `src/tools/go-community-day-prep.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { listGoCommunityDays } from "./go-community-days.js";
import { getGoPokemonProfile } from "./go-pokemon.js";
import { getGoPokemonMoveset } from "./go-moves.js";
import { getGoEvolutionChain } from "./go-evolution.js";

export function registerGoGetCommunityDayPrepTool(server: McpServer) {
  server.registerTool(
    "go_community_day_prep",
    {
      title: "Briefing do Community Day atual/mais recente",
      description:
        "Junta o Community Day mais recente com o perfil, moveset (destacando o move exclusivo do evento) e " +
        "requisito de evolução de cada Pokémon em destaque, numa resposta só.",
      inputSchema: {},
    },
    async () =>
      runTool(async () => {
        const { events } = await listGoCommunityDays({ limit: 1 });
        if (events.length === 0) {
          throw new Error("Nenhum Community Day encontrado nos dados da PoGo API.");
        }
        const communityDay = events[0];

        const pokemon = await Promise.all(
          communityDay.boosted_pokemon.map(async (name) => {
            const [profile, moveset, evolution] = await Promise.all([
              getGoPokemonProfile(name),
              getGoPokemonMoveset(name),
              getGoEvolutionChain(name),
            ]);
            const exclusiveMoves = communityDay.event_moves.filter((m) => m.pokemon === name);
            return { name, profile, moveset, exclusive_moves: exclusiveMoves, evolution };
          }),
        );

        return jsonResult({ community_day: communityDay, pokemon });
      }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-community-day-prep.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-community-day-prep.ts src/tools/go-community-day-prep.test.ts
git commit -m "feat: add go_community_day_prep tool"
```

---

### Task 11: `go_evolution_planner`

**Files:**
- Create: `src/tools/go-evolution-planner.ts`
- Test: `src/tools/go-evolution-planner.test.ts`

**Interfaces:**
- Consumes: `getGoEvolutionChain` (Task 4), `getGoPokemonProfile` (Task 2), `getGoPokemonMoveset` (Task 3).

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-evolution-planner.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetEvolutionPlannerTool } from "./go-evolution-planner.js";

test("go_evolution_planner: Rhyhorn's chain shows Rhydon and Rhyperior each with their own stats", async () => {
  const handler = captureToolHandler(registerGoGetEvolutionPlannerTool, "go_evolution_planner");
  const result = await handler({ name_or_id: "Rhyhorn" });
  const body = parseToolJson(result);
  assert.equal(body.chain.species, "Rhyhorn");
  assert.ok(body.chain.profile.base_stats);
  const rhydon = body.chain.evolves_to[0];
  assert.equal(rhydon.species, "Rhydon");
  assert.ok(rhydon.profile.base_stats.attack > body.chain.profile.base_stats.attack);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-evolution-planner.js'`

- [ ] **Step 3: Implement the tool**

Write `src/tools/go-evolution-planner.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { getGoEvolutionChain } from "./go-evolution.js";
import { getGoPokemonProfile } from "./go-pokemon.js";
import { getGoPokemonMoveset } from "./go-moves.js";

interface ChainNode {
  species: string;
  condition?: string;
  evolves_to: ChainNode[];
  [key: string]: unknown;
}

async function annotate(node: ChainNode): Promise<Record<string, unknown>> {
  const [profile, moveset, evolvesTo] = await Promise.all([
    getGoPokemonProfile(node.species),
    getGoPokemonMoveset(node.species),
    Promise.all(node.evolves_to.map((child) => annotate(child))),
  ]);
  return {
    species: node.species,
    condition: node.condition,
    profile,
    moveset,
    evolves_to: evolvesTo,
  };
}

export function registerGoGetEvolutionPlannerTool(server: McpServer) {
  server.registerTool(
    "go_evolution_planner",
    {
      title: "Comparação pré/pós evolução no Pokémon GO",
      description:
        "Pra um Pokémon e sua cadeia de evolução, devolve stats, tipos e moveset de cada estágio lado a lado " +
        "junto com o requisito de candy/item de cada salto — pra decidir se vale evoluir agora.",
      inputSchema: {
        name_or_id: z.string().describe("Nome ou id de qualquer Pokémon da cadeia (não precisa ser o estágio base)."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const { base_species_id, chain } = await getGoEvolutionChain(name_or_id);
        const annotated = await annotate(chain as unknown as ChainNode);
        return jsonResult({ base_species_id, chain: annotated });
      }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-evolution-planner.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-evolution-planner.ts src/tools/go-evolution-planner.test.ts
git commit -m "feat: add go_evolution_planner tool"
```

---

### Task 12: `go_pvp_matchup_analyzer`

**Files:**
- Create: `src/tools/go-pvp-matchup-analyzer.ts`
- Test: `src/tools/go-pvp-matchup-analyzer.test.ts`

**Interfaces:**
- Consumes: `getGoPokemonProfile` (Task 2), `getGoPokemonMoveset` (Task 3), `typeEffectiveness` (Task 1).

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-pvp-matchup-analyzer.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetPvpMatchupAnalyzerTool } from "./go-pvp-matchup-analyzer.js";

test("go_pvp_matchup_analyzer: reports raw EPS/DPT/DPE metrics for both sides, no fabricated single rating", async () => {
  const handler = captureToolHandler(registerGoGetPvpMatchupAnalyzerTool, "go_pvp_matchup_analyzer");
  const result = await handler({ pokemon_a: "Azumarill", pokemon_b: "Skarmory" });
  const body = parseToolJson(result);
  assert.equal(body.pokemon_a.name, "Azumarill");
  assert.equal(body.pokemon_b.name, "Skarmory");
  assert.ok(body.pokemon_a.fast_moves[0].eps > 0);
  assert.ok(body.pokemon_a.charged_moves[0].dpe > 0);
  assert.equal(body.rating, undefined);
  assert.equal(body.winner, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-pvp-matchup-analyzer.js'`

- [ ] **Step 3: Implement the tool**

Write `src/tools/go-pvp-matchup-analyzer.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { typeEffectiveness } from "../go-battle-math.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { getGoPokemonProfile } from "./go-pokemon.js";
import { getGoPokemonMoveset } from "./go-moves.js";
import type { GoTypeEffectivenessTable } from "../go-types.js";

async function buildSide(nameOrId: string, opponentTypes: string[], typeTable: GoTypeEffectivenessTable) {
  const [profile, moveset] = await Promise.all([getGoPokemonProfile(nameOrId), getGoPokemonMoveset(nameOrId)]);

  const fastMoves = moveset.fast_moves
    .filter((m) => m.pvp)
    .map((m) => ({
      name: m.name,
      type: m.pvp!.type,
      power: m.pvp!.power,
      eps: m.pvp!.energy_delta / (m.pvp!.turn_duration * 0.5),
      dpt: m.pvp!.power / m.pvp!.turn_duration,
      effectiveness_vs_opponent: typeEffectiveness(m.pvp!.type, opponentTypes, typeTable),
    }));

  const chargedMoves = moveset.charged_moves
    .filter((m) => m.pvp)
    .map((m) => ({
      name: m.name,
      type: m.pvp!.type,
      power: m.pvp!.power,
      dpe: m.pvp!.power / Math.abs(m.pvp!.energy_delta),
      buffs: m.pvp!.buffs ?? null,
      effectiveness_vs_opponent: typeEffectiveness(m.pvp!.type, opponentTypes, typeTable),
    }));

  return {
    name: profile.name,
    types: profile.types,
    base_stats: profile.base_stats,
    fast_moves: fastMoves,
    charged_moves: chargedMoves,
  };
}

export function registerGoGetPvpMatchupAnalyzerTool(server: McpServer) {
  server.registerTool(
    "go_pvp_matchup_analyzer",
    {
      title: "Métricas de matchup de PvP no Pokémon GO",
      description:
        "Compara dois Pokémon lado a lado pra PvP: stats base, e por move — EPS (fast) ou DPE (charged), DPT " +
        "do fast move, buffs do charged move, e efetividade de tipo contra o oponente. NÃO simula a batalha " +
        "nem produz um rating único de vantagem (exigiria pesos inventados sem simulador de batalha real) — " +
        "reporta os fatos crus pra você julgar.",
      inputSchema: {
        pokemon_a: z.string().describe("Nome ou id do primeiro Pokémon."),
        pokemon_b: z.string().describe("Nome ou id do segundo Pokémon."),
      },
    },
    async ({ pokemon_a, pokemon_b }) =>
      runTool(async () => {
        const typeTable = await getGoData<GoTypeEffectivenessTable>("type_effectiveness");
        const profileA = await getGoPokemonProfile(pokemon_a);
        const profileB = await getGoPokemonProfile(pokemon_b);

        const [sideA, sideB] = await Promise.all([
          buildSide(pokemon_a, profileB.types ?? [], typeTable),
          buildSide(pokemon_b, profileA.types ?? [], typeTable),
        ]);

        return jsonResult({
          pokemon_a: sideA,
          pokemon_b: sideB,
          note:
            "Sem simulação de batalha turno a turno (shields, timing de troca). effectiveness_vs_opponent é a " +
            "efetividade de tipo real do GO do move contra os tipos do oponente.",
        });
      }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-pvp-matchup-analyzer.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-pvp-matchup-analyzer.ts src/tools/go-pvp-matchup-analyzer.test.ts
git commit -m "feat: add go_pvp_matchup_analyzer tool (raw metrics, no fabricated rating)"
```

---

### Task 13: `go_shadow_purify_advisor`

**Files:**
- Create: `src/tools/go-shadow-purify-advisor.ts`
- Test: `src/tools/go-shadow-purify-advisor.test.ts`

**Interfaces:**
- Consumes: `getGoPokemonProfile` (Task 2).

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-shadow-purify-advisor.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetShadowPurifyAdvisorTool } from "./go-shadow-purify-advisor.js";

test("go_shadow_purify_advisor: Return has more power than Frustration, and purification effects are documented", async () => {
  const handler = captureToolHandler(registerGoGetShadowPurifyAdvisorTool, "go_shadow_purify_advisor");
  const result = await handler({ name_or_id: "Larvitar" });
  const body = parseToolJson(result);
  assert.equal(body.shadow_charged_move.name, "Frustration");
  assert.equal(body.purified_charged_move.name, "Return");
  assert.ok(body.purified_charged_move.power > body.shadow_charged_move.power);
  assert.equal(body.purification_effects.iv_bonus_per_stat, 2);
  assert.equal(body.purification_effects.min_level, 25);
  assert.equal(body.purification_effects.powerup_discount, 0.1);
  assert.ok(typeof body.note === "string" && body.note.includes("stardust"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-shadow-purify-advisor.js'`

- [ ] **Step 3: Implement the tool**

Write `src/tools/go-shadow-purify-advisor.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { getGoPokemonProfile } from "./go-pokemon.js";
import type { GoChargedMove } from "../go-types.js";

/**
 * Stable, official purification effects (Niantic-documented, verified against community sources) — not
 * exposed by any PoGo API endpoint, so hardcoded here, same precedent as the CP formula in go-utils.ts.
 */
const PURIFICATION_EFFECTS = {
  iv_bonus_per_stat: 2,
  iv_cap: 15,
  min_level: 25,
  powerup_discount: 0.1,
};

export function registerGoGetShadowPurifyAdvisorTool(server: McpServer) {
  server.registerTool(
    "go_shadow_purify_advisor",
    {
      title: "Comparação Shadow vs. Purified no Pokémon GO",
      description:
        "Compara o charged move Frustration (que todo Shadow recebe à força) com Return (que todo Purified " +
        "recebe em troca), e lista os efeitos oficiais estáveis da purificação (+2 IV por stat até o teto de " +
        "15, nível mínimo 25, 10% de desconto em power-up). NÃO inclui o custo em stardust/candy de purificar " +
        "— esse dado não existe em nenhum dos 47 endpoints da PoGo API.",
      inputSchema: {
        name_or_id: z.string().describe("Nome ou id do Pokémon Shadow."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const [profile, chargedMoves] = await Promise.all([
          getGoPokemonProfile(name_or_id),
          getGoData<GoChargedMove[]>("charged_moves"),
        ]);

        const frustration = chargedMoves.find((m) => m.name === "Frustration");
        const returnMove = chargedMoves.find((m) => m.name === "Return");
        if (!frustration || !returnMove) {
          throw new Error("Frustration/Return não encontrados nos dados de charged moves do Pokémon GO.");
        }

        return jsonResult({
          pokemon: profile.name,
          shadow_available: profile.shadow_available,
          shadow_charged_move: frustration,
          purified_charged_move: returnMove,
          purification_effects: PURIFICATION_EFFECTS,
          note:
            "Custo em stardust/candy pra purificar não está disponível em nenhum endpoint da PoGo API — não " +
            "incluído por falta de fonte de dado.",
        });
      }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-shadow-purify-advisor.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-shadow-purify-advisor.ts src/tools/go-shadow-purify-advisor.test.ts
git commit -m "feat: add go_shadow_purify_advisor tool"
```

---

### Task 14: `go_iv_and_moveset_report`

**Files:**
- Create: `src/tools/go-iv-moveset-report.ts`
- Test: `src/tools/go-iv-moveset-report.test.ts`

**Interfaces:**
- Consumes: `estimateGoIv` (Task 7), `getGoPokemonProfile` (Task 2), `getGoPokemonMoveset` (Task 3), `calculateCp` (existing, `src/go-utils.ts`).

- [ ] **Step 1: Write the failing test**

Write `src/tools/go-iv-moveset-report.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetIvMovesetReportTool } from "./go-iv-moveset-report.js";

test("go_iv_and_moveset_report: league_fit never exceeds its own cap and reports Master at the data ceiling", async () => {
  const handler = captureToolHandler(registerGoGetIvMovesetReportTool, "go_iv_and_moveset_report");
  const result = await handler({ name_or_id: "Gabite", cp: 1064, hp: 109, stardust_cost: 2500 });
  const body = parseToolJson(result);

  assert.equal(body.iv_matches.length, 1);
  const little = body.league_fit.find((l: any) => l.league === "Little");
  const great = body.league_fit.find((l: any) => l.league === "Great");
  const master = body.league_fit.find((l: any) => l.league === "Master");
  assert.ok(little.cp_at_max_level <= 500);
  assert.ok(great.cp_at_max_level <= 1500);
  assert.equal(master.level, 45);
  assert.equal(body.best_league, undefined); // must not fabricate a "best league" verdict
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-iv-moveset-report.js'`

- [ ] **Step 3: Implement the tool**

Write `src/tools/go-iv-moveset-report.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { calculateCp } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { estimateGoIv } from "./go-iv.js";
import { getGoPokemonProfile } from "./go-pokemon.js";
import { getGoPokemonMoveset } from "./go-moves.js";

const LEAGUE_CAPS: { league: string; cap: number | null }[] = [
  { league: "Little", cap: 500 },
  { league: "Great", cap: 1500 },
  { league: "Ultra", cap: 2500 },
  { league: "Master", cap: null },
];

const MAX_LEVEL = 45; // data ceiling — see go_estimate_iv's documented limitation
const LEVEL_STEP = 0.5;

async function maxLevelUnderCap(baseStats: { attack: number; defense: number; stamina: number }, ivs: { attack: number; defense: number; stamina: number }, cap: number | null) {
  let bestLevel = 1;
  let bestCp = await calculateCp(
    { base_attack: baseStats.attack, base_defense: baseStats.defense, base_stamina: baseStats.stamina },
    1,
    ivs,
  );
  for (let level = LEVEL_STEP; level <= MAX_LEVEL; level += LEVEL_STEP) {
    const cp = await calculateCp(
      { base_attack: baseStats.attack, base_defense: baseStats.defense, base_stamina: baseStats.stamina },
      level,
      ivs,
    );
    if (cap !== null && cp > cap) break;
    bestLevel = level;
    bestCp = cp;
  }
  return { level: bestLevel, cp_at_max_level: bestCp };
}

export function registerGoGetIvMovesetReportTool(server: McpServer) {
  server.registerTool(
    "go_iv_and_moveset_report",
    {
      title: "Relatório de IV e moveset de um Pokémon do Pokémon GO",
      description:
        "Combina 'go_estimate_iv' com o perfil, moveset de PvP e cabimento em liga (Little/Great/Ultra: " +
        "maior nível, em incrementos de 0.5 até o teto de dados de 45, que mantém o CP dentro do cap da " +
        "liga; Master: sem cap, CP no nível 45) do Pokémon. NÃO afirma qual é 'a melhor liga' — reporta o CP " +
        "exato em cada cap e deixa a decisão pra você.",
      inputSchema: {
        name_or_id: z.string().describe("Nome (ex: 'Pikachu') ou id numérico do Pokémon."),
        cp: z.number().int().min(10).describe("CP observado do Pokémon."),
        hp: z.number().int().min(1).describe("HP máximo observado do Pokémon."),
        level: z.number().min(1).max(45).optional().describe("Nível do Pokémon, se conhecido."),
        stardust_cost: z.number().int().optional().describe("Custo de stardust do botão de Power Up, se 'level' não for conhecido."),
      },
    },
    async ({ name_or_id, cp, hp, level, stardust_cost }) =>
      runTool(async () => {
        const [ivReport, profile, moveset] = await Promise.all([
          estimateGoIv(name_or_id, cp, hp, level, stardust_cost),
          getGoPokemonProfile(name_or_id),
          getGoPokemonMoveset(name_or_id),
        ]);

        const bestMatch = ivReport.matches[0];
        const ivs = { attack: bestMatch.attack_iv, defense: bestMatch.defense_iv, stamina: bestMatch.stamina_iv };
        const baseStats = profile.base_stats as { attack: number; defense: number; stamina: number };

        const leagueFit = await Promise.all(
          LEAGUE_CAPS.map(async ({ league, cap }) => {
            const { level: maxLevel, cp_at_max_level } = await maxLevelUnderCap(baseStats, ivs, cap);
            return { league, cap, level: maxLevel, cp_at_max_level };
          }),
        );

        return jsonResult({
          pokemon: profile.name,
          iv_matches: ivReport.matches,
          ambiguous_levels: ivReport.ambiguous_levels,
          pvp_moveset: {
            fast_moves: moveset.fast_moves.map((m) => m.pvp).filter(Boolean),
            charged_moves: moveset.charged_moves.map((m) => m.pvp).filter(Boolean),
          },
          league_fit: leagueFit,
          note: "league_fit usa o IV de maior porcentagem entre as combinações encontradas (iv_matches[0]).",
        });
      }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-iv-moveset-report.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/tools/go-iv-moveset-report.ts src/tools/go-iv-moveset-report.test.ts
git commit -m "feat: add go_iv_and_moveset_report tool (reports CP-per-league-cap facts, no league verdict)"
```

---

### Task 15: `go_regional_dex_completion_helper`

**Files:**
- Modify: `src/tools/go-regional-forms.ts` (export `collectRegionalForms`, created in the leaf-tools plan Task 3)
- Modify: `src/tools/go-pokemon-sources.ts` (export `getPokemonSources`, created in the leaf-tools plan Task 6)
- Create: `src/tools/go-regional-dex-helper.ts`
- Test: `src/tools/go-regional-dex-helper.test.ts`

**Interfaces:**
- Produces: `collectRegionalForms()` (exported, not renamed — was already `async function collectRegionalForms()`, just add `export`). `getPokemonSources(nameOrId)` in `go-pokemon-sources.ts`.
- Produces: `registerGoGetRegionalDexHelperTool(server)`.

- [ ] **Step 1: Export `collectRegionalForms` in `go-regional-forms.ts`**

In `src/tools/go-regional-forms.ts` (from the leaf-tools plan), change:

```typescript
async function collectRegionalForms(): Promise<GoRegionalFormEntry[]> {
```

to:

```typescript
export async function collectRegionalForms(): Promise<GoRegionalFormEntry[]> {
```

No other change to that file.

- [ ] **Step 2: Refactor `go-pokemon-sources.ts` to export `getPokemonSources`**

Replace the entire contents of `src/tools/go-pokemon-sources.ts` with:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGoData } from "../go-client.js";
import { resolveGoPokemon } from "../go-utils.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import type { GoFormTaggedEntry, GoNamesById, GoRaidExclusiveById } from "../go-types.js";

export async function getPokemonSources(nameOrId: string) {
  const { id, name } = await resolveGoPokemon(nameOrId);

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

  return {
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
  };
}

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
    async ({ name_or_id }) => runTool(async () => jsonResult(await getPokemonSources(name_or_id))),
  );
}
```

- [ ] **Step 3: Write the failing test**

Write `src/tools/go-regional-dex-helper.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureToolHandler, parseToolJson } from "../test-helpers.js";
import { registerGoGetRegionalDexHelperTool } from "./go-regional-dex-helper.js";

test("go_regional_dex_completion_helper: reports per-Pokémon facts, no single 'best channel' verdict", async () => {
  const handler = captureToolHandler(registerGoGetRegionalDexHelperTool, "go_regional_dex_completion_helper");
  const result = await handler({ missing: ["Heatmor", "Voltorb"] });
  const body = parseToolJson(result);
  assert.equal(body.results.length, 2);
  const voltorb = body.results.find((r: any) => r.pokemon === "Voltorb");
  assert.ok(voltorb.regional_forms.some((f: any) => f.region === "Hisui"));
  assert.equal(voltorb.recommended_channel, undefined);
});

test("go_regional_dex_completion_helper: an unknown name is reported as an error entry, not a thrown failure", async () => {
  const handler = captureToolHandler(registerGoGetRegionalDexHelperTool, "go_regional_dex_completion_helper");
  const result = await handler({ missing: ["Not A Real Pokemon Name"] });
  const body = parseToolJson(result);
  assert.equal(result.isError, undefined);
  assert.ok(typeof body.results[0].error === "string");
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Cannot find module './go-regional-dex-helper.js'`

- [ ] **Step 5: Implement the tool**

Write `src/tools/go-regional-dex-helper.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { collectRegionalForms } from "./go-regional-forms.js";
import { getPokemonSources } from "./go-pokemon-sources.js";
import { getGoPokemonProfile } from "./go-pokemon.js";

export function registerGoGetRegionalDexHelperTool(server: McpServer) {
  server.registerTool(
    "go_regional_dex_completion_helper",
    {
      title: "Ajudante de dex regional no Pokémon GO",
      description:
        "Pra uma lista de Pokémon que faltam na sua dex, devolve pra cada um: status de lançamento, formas " +
        "regionais disponíveis, e todos os canais de obtenção exclusivos (nest/raid/pesquisa/PvP/baby/" +
        "photobomb/disfarce de Ditto). Não escolhe um 'canal recomendado' — lista os fatos, você decide.",
      inputSchema: {
        missing: z.array(z.string()).min(1).describe("Lista de nomes de Pokémon que faltam na dex."),
      },
    },
    async ({ missing }) =>
      runTool(async () => {
        const allRegionalForms = await collectRegionalForms();

        const results = await Promise.all(
          missing.map(async (name) => {
            try {
              const [profile, sources] = await Promise.all([getGoPokemonProfile(name), getPokemonSources(name)]);
              const regionalForms = allRegionalForms.filter(
                (f) => f.pokemon_name.toLowerCase() === profile.name.toLowerCase(),
              );
              return {
                pokemon: profile.name,
                released_in_go: profile.released_in_go,
                sources: sources.sources,
                regional_forms: regionalForms,
              };
            } catch (err) {
              return { pokemon: name, error: err instanceof Error ? err.message : String(err) };
            }
          }),
        );

        return jsonResult({ results });
      }),
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run build && node --test dist/tools/go-regional-dex-helper.test.js`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add src/tools/go-regional-forms.ts src/tools/go-pokemon-sources.ts src/tools/go-regional-dex-helper.ts src/tools/go-regional-dex-helper.test.ts
git commit -m "feat: add go_regional_dex_completion_helper tool"
```

---

### Task 16: Wire all 8 composite tools into the server + update README

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`

- [ ] **Step 1: Register all 8 tools in `src/index.ts`**

Add imports after the 13 leaf-tool imports from the other plan:

```typescript
import { registerGoGetRaidCounterGuideTool } from "./tools/go-raid-counter-guide.js";
import { registerGoGetMegaRaidPlannerTool } from "./tools/go-mega-raid-planner.js";
import { registerGoGetCommunityDayPrepTool } from "./tools/go-community-day-prep.js";
import { registerGoGetEvolutionPlannerTool } from "./tools/go-evolution-planner.js";
import { registerGoGetPvpMatchupAnalyzerTool } from "./tools/go-pvp-matchup-analyzer.js";
import { registerGoGetShadowPurifyAdvisorTool } from "./tools/go-shadow-purify-advisor.js";
import { registerGoGetIvMovesetReportTool } from "./tools/go-iv-moveset-report.js";
import { registerGoGetRegionalDexHelperTool } from "./tools/go-regional-dex-helper.js";
```

Add registration calls after the 13 leaf-tool registrations:

```typescript
registerGoGetRaidCounterGuideTool(server);
registerGoGetMegaRaidPlannerTool(server);
registerGoGetCommunityDayPrepTool(server);
registerGoGetEvolutionPlannerTool(server);
registerGoGetPvpMatchupAnalyzerTool(server);
registerGoGetShadowPurifyAdvisorTool(server);
registerGoGetIvMovesetReportTool(server);
registerGoGetRegionalDexHelperTool(server);
```

- [ ] **Step 2: Add the 8 new rows to the README's PoGo API tools table**

Insert after the 13 leaf-tool rows added by the other plan:

```markdown
| `go_raid_counter_guide` | Melhores counters pro raid boss atual, ranqueados por DPS relativo |
| `go_mega_raid_planner` | Counters + dados factuais de mega evolução pra uma mega raid atual |
| `go_community_day_prep` | Briefing do Community Day mais recente (perfil, moveset, move exclusivo, evolução) |
| `go_evolution_planner` | Comparação lado a lado de stats/moveset em cada estágio de evolução |
| `go_pvp_matchup_analyzer` | Métricas cruas de PvP (EPS/DPT/DPE/efetividade) de dois Pokémon lado a lado |
| `go_shadow_purify_advisor` | Frustration vs. Return e efeitos oficiais da purificação |
| `go_iv_and_moveset_report` | IV estimado + moveset de PvP + CP no teto de cada liga |
| `go_regional_dex_completion_helper` | Status de lançamento, formas regionais e canais de obtenção de uma lista de Pokémon |
```

- [ ] **Step 3: Rebuild and run the full test suite**

Run: `npm run build && npm test`
Expected: PASS — every test file across both plans green, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts README.md
git commit -m "feat: register the 8 new PoGo composite tools and document them in README"
```

---

## After this plan

The MCP server exposes 36 tools total (15 original + 13 leaf + 8 composite). Reconnect the `pokemon` MCP server (exit and reopen Claude Code in this project) to see them natively as `mcp__pokemon__*` tools.
