# Pokédex MCP App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the project's first MCP App — two new tools, `pokedex_search` and `pokedex_view`, that share one `ui://pokedex/mcp-app.html` resource rendering a clickable Pokédex grid and a Pokémon detail card, without touching the 15 existing data-only tools.

**Architecture:** Two shared server-side helpers (`buildPokemonProfile`, `findMatchingNames`) are extracted from the existing `get_pokemon`/`search_pokemon` tools so the new UI tools reuse the exact same PokéAPI logic instead of duplicating it. `pokedex-ui.ts` registers one `registerAppResource` that serves a Vite-bundled single-file HTML+JS UI. `pokedex-search.ts` and `pokedex-view.ts` register `registerAppTool`s that both point `_meta.ui.resourceUri` at that same resource. Inside the UI, clicking a search result calls `pokedex_view` via `app.callServerTool()` and swaps to card view locally — no second resource, no host re-render.

**Tech Stack:** TypeScript (existing server), `@modelcontextprotocol/ext-apps` ^1.7.4 for the App/UI bridge, Vite ^8.1.5 + `vite-plugin-singlefile` ^2.3.3 (dev-only) to bundle the UI into one HTML file, vanilla JS/TS on the UI side (no framework).

## Global Constraints

- `get_pokemon` and `search_pokemon` (`src/tools/pokemon.ts`, `src/tools/search.ts`) must keep producing byte-identical output to today — they are refactored to call shared helpers, never behaviorally changed.
- `pokedex_search` and `pokedex_view` are new, separate tools — no UI is added to any existing tool.
- Exactly one `ui://` resource exists for this feature: `ui://pokedex/mcp-app.html`, referenced identically by both new tools' `_meta.ui.resourceUri` and by the single `registerAppResource` call.
- CSP (`resourceDomains: ["https://raw.githubusercontent.com"]`) is set **only** on the resource's `readCallback` return value (`contents[0]._meta.ui.csp`) — never on a tool's `_meta.ui` (the SDK's `McpUiToolMeta.csp` type is `never`; setting it there is a type error, not just a style issue).
- The project's `engines.node` floor is `>=18` — path resolution in server code must use `fileURLToPath(import.meta.url)`, never `import.meta.dirname` (Node 20.11+ only).
- `npm run build` (the existing `tsc` compile) must never try to compile UI source files. `tsconfig.json` must exclude `src/ui`.
- `@modelcontextprotocol/ext-apps` is a runtime dependency (the server imports `@modelcontextprotocol/ext-apps/server` at request time) — install as a regular `dependency`, not `devDependency`. `vite` and `vite-plugin-singlefile` are build-only — `devDependencies`.
- All new server files follow the existing per-file `registerXTool(server)` pattern (see `src/tools/*.ts`) and the existing `runTool`/error-translation convention from `src/tool-helpers.ts` — no new error-handling helper is introduced.

---

### Task 1: Extract `buildPokemonProfile` shared helper

**Files:**
- Create: `src/pokemon-profile.ts`
- Modify: `src/tools/pokemon.ts`

**Interfaces:**
- Produces: `export interface PokemonProfile { id: number; name: string; height_decimeters: number; weight_hectograms: number; base_experience: number | null; types: string[]; abilities: { name: string; is_hidden: boolean }[]; base_stats: Record<string, number>; sprites: ReturnType<typeof pickAllSprites>; held_items: string[]; pokedex_description: string | null; capture_rate: number; base_happiness: number | null; growth_rate: string; egg_groups: string[]; gender_rate_eighths_female: number; has_gender_differences: boolean; generation: string; color: string; habitat: string | null; is_baby: boolean; is_legendary: boolean; is_mythical: boolean; evolves_from: string | null; evolution_chain_id: number; varieties: { name: string; is_default: boolean }[]; }` and `export async function buildPokemonProfile(nameOrId: string): Promise<PokemonProfile>` — consumed by Task 4's `pokedex-view.ts`.
- Consumes: `getResource` from `src/pokeapi-client.ts`, `idFromUrl`/`pickAllSprites`/`pickFlavorText` from `src/utils.ts`, `Pokemon`/`PokemonSpecies` types from `src/types.ts` (all already exist, unchanged).

- [ ] **Step 1: Create `src/pokemon-profile.ts` with the extracted logic**

This is a pure move: the object-building logic currently inline in `get_pokemon`'s handler becomes a standalone, reusable function.

```typescript
// src/pokemon-profile.ts
import { getResource } from "./pokeapi-client.js";
import { idFromUrl, pickAllSprites, pickFlavorText } from "./utils.js";
import type { Pokemon, PokemonSpecies } from "./types.js";

export interface PokemonProfile {
  id: number;
  name: string;
  height_decimeters: number;
  weight_hectograms: number;
  base_experience: number | null;
  types: string[];
  abilities: { name: string; is_hidden: boolean }[];
  base_stats: Record<string, number>;
  sprites: ReturnType<typeof pickAllSprites>;
  held_items: string[];
  pokedex_description: string | null;
  capture_rate: number;
  base_happiness: number | null;
  growth_rate: string;
  egg_groups: string[];
  gender_rate_eighths_female: number;
  has_gender_differences: boolean;
  generation: string;
  color: string;
  habitat: string | null;
  is_baby: boolean;
  is_legendary: boolean;
  is_mythical: boolean;
  evolves_from: string | null;
  evolution_chain_id: number;
  varieties: { name: string; is_default: boolean }[];
}

/** Builds the full Pokémon profile (stats, sprites, species data) shared by get_pokemon and pokedex_view. */
export async function buildPokemonProfile(nameOrId: string): Promise<PokemonProfile> {
  const pokemon = await getResource<Pokemon>("pokemon", nameOrId);
  const species = await getResource<PokemonSpecies>("pokemon-species", pokemon.species.name);

  return {
    id: pokemon.id,
    name: pokemon.name,
    height_decimeters: pokemon.height,
    weight_hectograms: pokemon.weight,
    base_experience: pokemon.base_experience,
    types: pokemon.types.map((t) => t.type.name),
    abilities: pokemon.abilities.map((a) => ({
      name: a.ability.name,
      is_hidden: a.is_hidden,
    })),
    base_stats: Object.fromEntries(pokemon.stats.map((s) => [s.stat.name, s.base_stat])),
    sprites: pickAllSprites(pokemon.sprites),
    held_items: pokemon.held_items.map((h) => h.item.name),
    pokedex_description: pickFlavorText(species.flavor_text_entries),
    capture_rate: species.capture_rate,
    base_happiness: species.base_happiness,
    growth_rate: species.growth_rate.name,
    egg_groups: species.egg_groups.map((g) => g.name),
    gender_rate_eighths_female: species.gender_rate,
    has_gender_differences: species.has_gender_differences,
    generation: species.generation.name,
    color: species.color.name,
    habitat: species.habitat?.name ?? null,
    is_baby: species.is_baby,
    is_legendary: species.is_legendary,
    is_mythical: species.is_mythical,
    evolves_from: species.evolves_from_species?.name ?? null,
    evolution_chain_id: idFromUrl(species.evolution_chain.url),
    varieties: species.varieties.map((v) => ({
      name: v.pokemon.name,
      is_default: v.is_default,
    })),
  };
}
```

- [ ] **Step 2: Replace the inline logic in `src/tools/pokemon.ts` with a call to the new helper**

Replace the full contents of `src/tools/pokemon.ts` with:

```typescript
// src/tools/pokemon.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { buildPokemonProfile } from "../pokemon-profile.js";

export function registerGetPokemonTool(server: McpServer) {
  server.registerTool(
    "get_pokemon",
    {
      title: "Perfil completo de um Pokémon",
      description:
        "Retorna o perfil completo de um Pokémon: stats base, tipos, abilities, todos os sprites/imagens " +
        "(artwork oficial, Pokémon Home, GIFs animados do Showdown, Dream World), descrição da Pokédex, " +
        "taxa de captura, felicidade base, growth rate, egg groups, geração, status lendário/mítico, " +
        "formas/variedades disponíveis e o id da cadeia de evolução (use get_evolution_chain para os detalhes).",
      inputSchema: {
        name_or_id: z
          .string()
          .describe("Nome (ex: 'pikachu', 'mr-mime') ou id numérico do Pokémon."),
      },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const profile = await buildPokemonProfile(name_or_id);
        return jsonResult(profile);
      }),
  );
}
```

- [ ] **Step 3: Build and verify no compile errors**

Run: `cd /Users/gfontes/Documents/projects/pokemon && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Verify `get_pokemon` output is unchanged**

Write this script to `/tmp/verify-task1.mjs`:

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/Users/gfontes/Documents/projects/pokemon/dist/index.js"],
});
const client = new Client({ name: "verify-task1", version: "1.0.0" });
await client.connect(transport);

const result = await client.callTool({ name: "get_pokemon", arguments: { name_or_id: "pikachu" } });
const profile = JSON.parse(result.content[0].text);

const checks = [
  [profile.id === 25, `id deveria ser 25, veio ${profile.id}`],
  [profile.name === "pikachu", `name deveria ser pikachu, veio ${profile.name}`],
  [profile.types.includes("electric"), `types deveria incluir electric, veio ${JSON.stringify(profile.types)}`],
  [typeof profile.base_stats.speed === "number", "base_stats.speed deveria ser number"],
  [profile.sprites.official_artwork !== undefined, "sprites.official_artwork deveria existir"],
  [profile.evolution_chain_id > 0, "evolution_chain_id deveria ser > 0"],
];

let failed = false;
for (const [ok, msg] of checks) {
  if (!ok) {
    console.error("FALHOU:", msg);
    failed = true;
  }
}

if (failed) {
  console.error("Task 1: FALHOU");
  process.exit(1);
}
console.log("Task 1 OK:", profile.name, profile.id, profile.types, "abilities:", profile.abilities.length);
await client.close();
process.exit(0);
```

Run: `cd /Users/gfontes/Documents/projects/pokemon && node /tmp/verify-task1.mjs`
Expected: `Task 1 OK: pikachu 25 [ 'electric' ] abilities: 3` (exit code 0, no "FALHOU" lines).

- [ ] **Step 5: Commit**

```bash
cd /Users/gfontes/Documents/projects/pokemon
git add src/pokemon-profile.ts src/tools/pokemon.ts
git commit -m "Extract buildPokemonProfile helper from get_pokemon"
```

---

### Task 2: Extract `findMatchingNames` shared helper

**Files:**
- Create: `src/pokemon-search.ts`
- Modify: `src/tools/search.ts`

**Interfaces:**
- Produces: `export interface PokemonSearchFilters { query?: string; type?: string; generation?: string; }` and `export async function findMatchingNames(filters: PokemonSearchFilters): Promise<string[]>` — returns every matching name, sorted alphabetically, **unlimited** (callers apply their own `limit`/slicing). Consumed by Task 4's `pokedex-search.ts`.
- Consumes: `getFullList`/`getResource` from `src/pokeapi-client.ts`, `Generation`/`NamedAPIResourceList`/`PokemonType` types from `src/types.ts` (all already exist, unchanged).

- [ ] **Step 1: Create `src/pokemon-search.ts` with the extracted filter logic**

```typescript
// src/pokemon-search.ts
import { getFullList, getResource } from "./pokeapi-client.js";
import type { Generation, NamedAPIResourceList, PokemonType } from "./types.js";

export interface PokemonSearchFilters {
  query?: string;
  type?: string;
  generation?: string;
}

/** Returns every Pokémon name matching all given filters (intersection), sorted alphabetically, unlimited. */
export async function findMatchingNames({ query, type, generation }: PokemonSearchFilters): Promise<string[]> {
  const candidateSets: Set<string>[] = [];

  if (type) {
    const typeData = await getResource<PokemonType>("type", type);
    candidateSets.push(new Set(typeData.pokemon.map((p) => p.pokemon.name)));
  }

  if (generation) {
    const genData = await getResource<Generation>("generation", generation);
    candidateSets.push(new Set(genData.pokemon_species.map((s) => s.name)));
  }

  if (query) {
    const list = await getFullList<NamedAPIResourceList>("pokemon");
    const needle = query.trim().toLowerCase();
    candidateSets.push(new Set(list.results.filter((r) => r.name.includes(needle)).map((r) => r.name)));
  }

  let names: string[];
  if (candidateSets.length === 0) {
    const list = await getFullList<NamedAPIResourceList>("pokemon");
    names = list.results.map((r) => r.name);
  } else {
    names = [...candidateSets.reduce((a, b) => new Set([...a].filter((x) => b.has(x))))];
  }

  names.sort();
  return names;
}
```

- [ ] **Step 2: Replace the inline logic in `src/tools/search.ts` with a call to the new helper**

Replace the full contents of `src/tools/search.ts` with:

```typescript
// src/tools/search.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, runTool } from "../tool-helpers.js";
import { findMatchingNames } from "../pokemon-search.js";

export function registerSearchPokemonTool(server: McpServer) {
  server.registerTool(
    "search_pokemon",
    {
      title: "Busca/filtra Pokémon",
      description:
        "Busca Pokémon por substring do nome e/ou filtra por tipo e/ou geração. Combine filtros para " +
        "interseção (ex: query='saur' + type='poison'). Sem nenhum filtro, retorna os primeiros da lista geral. " +
        "Use os nomes retornados aqui como entrada para get_pokemon, get_pokemon_moves, etc.",
      inputSchema: {
        query: z.string().optional().describe("Substring do nome do Pokémon (case-insensitive)."),
        type: z.string().optional().describe("Filtra por tipo (ex: 'fire', 'dragon')."),
        generation: z
          .string()
          .optional()
          .describe("Filtra por geração (ex: 'generation-i', ou id numérico como string '1')."),
        limit: z.number().int().min(1).max(200).optional().describe("Máximo de resultados (padrão 50)."),
      },
    },
    async ({ query, type, generation, limit }) =>
      runTool(async () => {
        const max = limit ?? 50;
        const names = await findMatchingNames({ query, type, generation });
        const results = names.slice(0, max);
        return jsonResult({ total_matches: names.length, returned: results.length, results });
      }),
  );
}
```

- [ ] **Step 3: Build and verify no compile errors**

Run: `cd /Users/gfontes/Documents/projects/pokemon && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Verify `search_pokemon` output is unchanged**

Write this script to `/tmp/verify-task2.mjs`:

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/Users/gfontes/Documents/projects/pokemon/dist/index.js"],
});
const client = new Client({ name: "verify-task2", version: "1.0.0" });
await client.connect(transport);

const result = await client.callTool({ name: "search_pokemon", arguments: { query: "char", limit: 10 } });
const data = JSON.parse(result.content[0].text);

const sorted = [...data.results].sort();
const checks = [
  [data.results.includes("charmander"), `results deveria incluir charmander, veio ${JSON.stringify(data.results)}`],
  [data.results.length === data.returned, "returned deveria bater com results.length"],
  [data.total_matches >= data.returned, "total_matches deveria ser >= returned"],
  [JSON.stringify(data.results) === JSON.stringify(sorted), "results deveria vir ordenado alfabeticamente"],
];

let failed = false;
for (const [ok, msg] of checks) {
  if (!ok) {
    console.error("FALHOU:", msg);
    failed = true;
  }
}

if (failed) {
  console.error("Task 2: FALHOU");
  process.exit(1);
}
console.log("Task 2 OK:", data.total_matches, "matches,", data.results);
await client.close();
process.exit(0);
```

Run: `cd /Users/gfontes/Documents/projects/pokemon && node /tmp/verify-task2.mjs`
Expected: `Task 2 OK: <N> matches, [ ...nomes ordenados incluindo 'charmander'... ]` (exit code 0, no "FALHOU" lines).

- [ ] **Step 5: Commit**

```bash
cd /Users/gfontes/Documents/projects/pokemon
git add src/pokemon-search.ts src/tools/search.ts
git commit -m "Extract findMatchingNames helper from search_pokemon"
```

---

### Task 3: UI build tooling (Vite + ext-apps, placeholder bundle)

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `src/ui/pokedex/tsconfig.json`
- Create: `src/ui/pokedex/vite.config.ts`
- Create: `src/ui/pokedex/mcp-app.html`
- Create: `src/ui/pokedex/src/mcp-app.ts`

**Interfaces:**
- Produces: a working `npm run build:ui` script that bundles `src/ui/pokedex/mcp-app.html` (+ its `src/mcp-app.ts` entry) into a single self-contained file at `src/ui/pokedex/dist/mcp-app.html`. Task 4's `pokedex-ui.ts` reads this exact path at server startup.
- Consumes: nothing from earlier tasks — this task is infrastructure-only, verified independently of Task 1/2's server logic.

- [ ] **Step 1: Install the new dependencies**

Run:
```bash
cd /Users/gfontes/Documents/projects/pokemon
npm install @modelcontextprotocol/ext-apps@^1.7.4
npm install --save-dev vite@^8.1.5 vite-plugin-singlefile@^2.3.3
```
Expected: `package.json` gains `"@modelcontextprotocol/ext-apps": "^1.7.4"` under `dependencies`, and `vite`/`vite-plugin-singlefile` under `devDependencies`; `package-lock.json` updates; both commands exit 0.

- [ ] **Step 2: Exclude `src/ui` from the server's TypeScript build**

In `tsconfig.json`, add an `exclude` key alongside the existing `include`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": false,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/ui"]
}
```

- [ ] **Step 3: Create the UI-side TypeScript config (type-checking only, not used by the server's `tsc`)**

```jsonc
// src/ui/pokedex/tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create the Vite config**

```typescript
// src/ui/pokedex/vite.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const INPUT = process.env.INPUT;
if (!INPUT) {
  throw new Error("INPUT environment variable is not set");
}

const isDevelopment = process.env.NODE_ENV === "development";

export default defineConfig({
  // root fixado explicitamente (não o cwd) porque este config vive em
  // src/ui/pokedex/, não na raiz do projeto.
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [viteSingleFile()],
  build: {
    sourcemap: isDevelopment ? "inline" : undefined,
    cssMinify: !isDevelopment,
    minify: !isDevelopment,
    rollupOptions: { input: INPUT },
    outDir: "dist", // relativo ao root => src/ui/pokedex/dist/mcp-app.html
    emptyOutDir: false,
  },
});
```

- [ ] **Step 5: Create the placeholder HTML entry**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Pokédex</title>
  </head>
  <body>
    <div id="root">Carregando Pokédex…</div>
    <script type="module" src="./src/mcp-app.ts"></script>
  </body>
</html>
```

Save as `src/ui/pokedex/mcp-app.html`.

- [ ] **Step 6: Create the placeholder UI script (proves the `ext-apps` import bundles correctly)**

```typescript
// src/ui/pokedex/src/mcp-app.ts
import { App } from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "Pokedex App", version: "1.0.0" });

app.connect().then(() => {
  const root = document.getElementById("root");
  if (root) root.textContent = "Pokédex UI conectada.";
});
```

- [ ] **Step 7: Add the `build:ui` script and wire it into `build`**

In `package.json`, update the `scripts` block:

```json
"scripts": {
  "build": "npm run build:ui && tsc",
  "build:ui": "INPUT=mcp-app.html vite build --config src/ui/pokedex/vite.config.ts",
  "start": "node dist/index.js",
  "dev": "tsc --watch",
  "inspector": "npx @modelcontextprotocol/inspector node dist/index.js"
}
```

- [ ] **Step 8: Run the UI build and verify the single-file bundle**

Run: `cd /Users/gfontes/Documents/projects/pokemon && npm run build:ui`
Expected: exits 0, creates `src/ui/pokedex/dist/mcp-app.html`.

Run: `grep -c "Pokédex UI conectada" /Users/gfontes/Documents/projects/pokemon/src/ui/pokedex/dist/mcp-app.html`
Expected: `1` — confirms the bundled JS (containing our placeholder string) was inlined into the single HTML file, not left as a separate `<script src>` reference.

- [ ] **Step 9: Run the full build (UI + server) to confirm the pipeline end-to-end**

Run: `cd /Users/gfontes/Documents/projects/pokemon && npm run build`
Expected: exits 0 — runs `build:ui` then `tsc`, and `tsc` does NOT attempt to compile anything under `src/ui` (confirmed by the `exclude` from Step 2; if it did, it would fail on DOM globals like `document` under `strict` mode without the `DOM` lib).

- [ ] **Step 10: Commit**

```bash
cd /Users/gfontes/Documents/projects/pokemon
git add package.json package-lock.json tsconfig.json src/ui/pokedex/tsconfig.json src/ui/pokedex/vite.config.ts src/ui/pokedex/mcp-app.html src/ui/pokedex/src/mcp-app.ts
git commit -m "Add Vite-based UI build pipeline for MCP Apps"
```

---

### Task 4: `pokedex_search` and `pokedex_view` tools + shared resource

**Files:**
- Create: `src/tools/pokedex-ui.ts`
- Create: `src/tools/pokedex-search.ts`
- Create: `src/tools/pokedex-view.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `buildPokemonProfile`/`PokemonProfile` from Task 1 (`src/pokemon-profile.ts`), `findMatchingNames` from Task 2 (`src/pokemon-search.ts`), the built `src/ui/pokedex/dist/mcp-app.html` from Task 3.
- Produces: `export const POKEDEX_RESOURCE_URI = "ui://pokedex/mcp-app.html"` from `pokedex-ui.ts`, imported by the other two files. `pokedex_search` returns `structuredContent: { results: {id, name, sprite, types}[] }`. `pokedex_view` returns `structuredContent: { pokemon: {id, name, sprite, height_decimeters, weight_hectograms, types, abilities, base_stats, pokedex_description, is_legendary, is_mythical, evolves_from} }`. Task 5's UI code consumes both these exact shapes.

- [ ] **Step 1: Create `src/tools/pokedex-ui.ts` (the shared resource registration)**

```typescript
// src/tools/pokedex-ui.ts
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const POKEDEX_RESOURCE_URI = "ui://pokedex/mcp-app.html";

// Compilado para dist/tools/pokedex-ui.js: sobe 2 níveis até a raiz do projeto.
// fileURLToPath (não import.meta.dirname) porque engines.node é >=18 e
// import.meta.dirname só existe a partir do Node 20.11.
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const UI_HTML_PATH = path.join(PROJECT_ROOT, "src/ui/pokedex/dist/mcp-app.html");

export function registerPokedexUiResource(server: McpServer) {
  registerAppResource(
    server,
    POKEDEX_RESOURCE_URI,
    POKEDEX_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(UI_HTML_PATH, "utf-8");
      return {
        contents: [
          {
            uri: POKEDEX_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            // CSP fica só aqui (no content item retornado pelo readCallback), nunca
            // no _meta.ui de uma tool — vale para pokedex_search e pokedex_view porque
            // as duas apontam pro mesmo resourceUri, logo pro mesmo readCallback.
            _meta: {
              ui: {
                csp: {
                  resourceDomains: ["https://raw.githubusercontent.com"],
                },
              },
            },
          },
        ],
      };
    },
  );
}
```

- [ ] **Step 2: Create `src/tools/pokedex-search.ts`**

```typescript
// src/tools/pokedex-search.ts
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getResource } from "../pokeapi-client.js";
import { findMatchingNames } from "../pokemon-search.js";
import { runTool } from "../tool-helpers.js";
import { POKEDEX_RESOURCE_URI } from "./pokedex-ui.js";
import type { Pokemon } from "../types.js";

const PokedexSearchResultItem = z.object({
  id: z.number(),
  name: z.string(),
  sprite: z.string().nullable(),
  types: z.array(z.string()),
});

export function registerPokedexSearchTool(server: McpServer) {
  registerAppTool(
    server,
    "pokedex_search",
    {
      title: "Busca Pokédex (com UI)",
      description:
        "Busca Pokémon por substring do nome e/ou filtra por tipo e/ou geração, e mostra os resultados " +
        "numa grade visual clicável (sprite, nome, tipos). Clicar num resultado abre o card de detalhe " +
        "via pokedex_view. Equivalente visual de search_pokemon — prefira esta quando o usuário quiser ver, " +
        "não só ler, os resultados.",
      inputSchema: {
        query: z.string().optional().describe("Substring do nome do Pokémon (case-insensitive)."),
        type: z.string().optional().describe("Filtra por tipo (ex: 'fire', 'dragon')."),
        generation: z
          .string()
          .optional()
          .describe("Filtra por geração (ex: 'generation-i', ou id numérico como string '1')."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe(
            "Máximo de resultados (padrão 24). Cada resultado custa uma consulta extra à PokéAPI " +
              "pra pegar sprite/tipos, por isso o teto é menor que o de search_pokemon.",
          ),
      },
      outputSchema: { results: z.array(PokedexSearchResultItem) },
      _meta: { ui: { resourceUri: POKEDEX_RESOURCE_URI } },
    },
    async ({ query, type, generation, limit }) =>
      runTool(async () => {
        const max = limit ?? 24;
        const names = await findMatchingNames({ query, type, generation });
        const page = names.slice(0, max);

        const results = await Promise.all(
          page.map(async (name) => {
            const pokemon = await getResource<Pokemon>("pokemon", name);
            return {
              id: pokemon.id,
              name: pokemon.name,
              sprite: pokemon.sprites.front_default,
              types: pokemon.types.map((t) => t.type.name),
            };
          }),
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `${names.length} Pokémon encontrado(s), mostrando ${results.length}.`,
            },
          ],
          structuredContent: { results },
        };
      }),
  );
}
```

- [ ] **Step 3: Create `src/tools/pokedex-view.ts`**

```typescript
// src/tools/pokedex-view.ts
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildPokemonProfile, type PokemonProfile } from "../pokemon-profile.js";
import { runTool } from "../tool-helpers.js";
import { POKEDEX_RESOURCE_URI } from "./pokedex-ui.js";

function pokemonProfileSprite(profile: PokemonProfile): string | null {
  return profile.sprites.official_artwork ?? profile.sprites.front_default;
}

export function registerPokedexViewTool(server: McpServer) {
  registerAppTool(
    server,
    "pokedex_view",
    {
      title: "Card de detalhe de um Pokémon (com UI)",
      description:
        "Retorna o perfil de um Pokémon (stats, tipos, abilities, sprite, descrição) e mostra num card " +
        "visual com stats em barra. Equivalente visual de get_pokemon — chamável direto (ex: 'mostra o " +
        "card do Pikachu') ou a partir de um clique em pokedex_search.",
      inputSchema: {
        name_or_id: z.string().describe("Nome (ex: 'pikachu', 'mr-mime') ou id numérico do Pokémon."),
      },
      outputSchema: {
        pokemon: z.object({
          id: z.number(),
          name: z.string(),
          sprite: z.string().nullable(),
          height_decimeters: z.number(),
          weight_hectograms: z.number(),
          types: z.array(z.string()),
          abilities: z.array(z.object({ name: z.string(), is_hidden: z.boolean() })),
          base_stats: z.record(z.string(), z.number()),
          pokedex_description: z.string().nullable(),
          is_legendary: z.boolean(),
          is_mythical: z.boolean(),
          evolves_from: z.string().nullable(),
        }),
      },
      _meta: { ui: { resourceUri: POKEDEX_RESOURCE_URI } },
    },
    async ({ name_or_id }) =>
      runTool(async () => {
        const profile = await buildPokemonProfile(name_or_id);
        const pokemon = {
          id: profile.id,
          name: profile.name,
          sprite: pokemonProfileSprite(profile),
          height_decimeters: profile.height_decimeters,
          weight_hectograms: profile.weight_hectograms,
          types: profile.types,
          abilities: profile.abilities,
          base_stats: profile.base_stats,
          pokedex_description: profile.pokedex_description,
          is_legendary: profile.is_legendary,
          is_mythical: profile.is_mythical,
          evolves_from: profile.evolves_from,
        };

        return {
          content: [{ type: "text" as const, text: `Perfil de ${pokemon.name} (#${pokemon.id}).` }],
          structuredContent: { pokemon },
        };
      }),
  );
}
```

- [ ] **Step 4: Register the three new pieces in `src/index.ts`**

Add these imports after the existing `registerGoEstimateIvTool` import:

```typescript
import { registerPokedexUiResource } from "./tools/pokedex-ui.js";
import { registerPokedexSearchTool } from "./tools/pokedex-search.js";
import { registerPokedexViewTool } from "./tools/pokedex-view.js";
```

Add these calls after `registerGoEstimateIvTool(server);`:

```typescript
registerPokedexUiResource(server);
registerPokedexSearchTool(server);
registerPokedexViewTool(server);
```

- [ ] **Step 5: Build and verify no compile errors**

Run: `cd /Users/gfontes/Documents/projects/pokemon && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Verify the tools and resource via a real MCP client**

Write this script to `/tmp/verify-task4.mjs`:

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/Users/gfontes/Documents/projects/pokemon/dist/index.js"],
});
const client = new Client({ name: "verify-task4", version: "1.0.0" });
await client.connect(transport);

let failed = false;
const check = (ok, msg) => {
  if (!ok) {
    console.error("FALHOU:", msg);
    failed = true;
  }
};

// pokedex_search
const search = await client.callTool({ name: "pokedex_search", arguments: { query: "char", limit: 5 } });
const searchData = search.structuredContent;
check(Array.isArray(searchData?.results), "pokedex_search deveria retornar structuredContent.results (array)");
check(searchData.results.length > 0, "pokedex_search deveria retornar pelo menos 1 resultado pra 'char'");
check(searchData.results.some((r) => r.name === "charmander"), "resultado deveria incluir charmander");
check(typeof searchData.results[0].sprite === "string", "cada resultado deveria ter sprite string");
check(Array.isArray(searchData.results[0].types), "cada resultado deveria ter types array");

// pokedex_search sem resultados
const emptySearch = await client.callTool({ name: "pokedex_search", arguments: { query: "zzzznotapokemon" } });
check(
  Array.isArray(emptySearch.structuredContent?.results) && emptySearch.structuredContent.results.length === 0,
  "pokedex_search com termo inexistente deveria retornar structuredContent.results: []",
);

// pokedex_view (válido)
const view = await client.callTool({ name: "pokedex_view", arguments: { name_or_id: "pikachu" } });
const viewData = view.structuredContent;
check(viewData?.pokemon?.id === 25, "pokedex_view(pikachu) deveria retornar pokemon.id === 25");
check(viewData.pokemon.types.includes("electric"), "pokemon.types deveria incluir electric");
check(typeof viewData.pokemon.sprite === "string", "pokemon.sprite deveria ser string");

// pokedex_view (inválido)
const viewInvalid = await client.callTool({ name: "pokedex_view", arguments: { name_or_id: "zzzznotapokemon" } });
check(viewInvalid.isError === true, "pokedex_view com nome inválido deveria vir com isError: true");

// resource: CSP e conteúdo
const resource = await client.readResource({ uri: "ui://pokedex/mcp-app.html" });
const content = resource.contents[0];
check(content.text.includes('id="root"'), "resource HTML deveria conter o elemento root");
check(
  content._meta?.ui?.csp?.resourceDomains?.includes("https://raw.githubusercontent.com"),
  "resource deveria declarar CSP liberando raw.githubusercontent.com",
);

if (failed) {
  console.error("Task 4: FALHOU");
  process.exit(1);
}
console.log("Task 4 OK: pokedex_search, pokedex_view e o resource compartilhado funcionam.");
await client.close();
process.exit(0);
```

Run: `cd /Users/gfontes/Documents/projects/pokemon && node /tmp/verify-task4.mjs`
Expected: `Task 4 OK: pokedex_search, pokedex_view e o resource compartilhado funcionam.` (exit code 0, no "FALHOU" lines).

- [ ] **Step 7: Commit**

```bash
cd /Users/gfontes/Documents/projects/pokemon
git add src/tools/pokedex-ui.ts src/tools/pokedex-search.ts src/tools/pokedex-view.ts src/index.ts
git commit -m "Add pokedex_search and pokedex_view MCP App tools"
```

---

### Task 5: Full UI — grid + card rendering and navigation

**Files:**
- Modify: `src/ui/pokedex/mcp-app.html`
- Modify: `src/ui/pokedex/src/mcp-app.ts`

**Interfaces:**
- Consumes: the exact `structuredContent` shapes produced by Task 4 — `{ results: {id, name, sprite, types}[] }` from `pokedex_search` and `{ pokemon: {id, name, sprite, height_decimeters, weight_hectograms, types, abilities, base_stats, pokedex_description, is_legendary, is_mythical, evolves_from} }` from `pokedex_view`.
- Produces: nothing consumed by later tasks — this is the terminal UI implementation.

- [ ] **Step 1: Replace `src/ui/pokedex/mcp-app.html` with the real markup + styles**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Pokédex</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; color: #222; }
      #root { padding: 12px; }
      .empty, .error { padding: 24px; text-align: center; color: #666; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
      .grid-item {
        display: flex; flex-direction: column; align-items: center; gap: 4px;
        padding: 8px; border: 1px solid #ddd; border-radius: 8px; background: none; cursor: pointer;
      }
      .grid-item:hover { background: #f2f2f2; }
      .grid-item img { width: 64px; height: 64px; image-rendering: pixelated; }
      .grid-item img.sprite-missing, .card img.sprite-missing { visibility: hidden; }
      .grid-item span { font-size: 12px; text-transform: capitalize; }
      .card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; }
      .card img { width: 160px; height: 160px; }
      .sprite-placeholder {
        display: flex; align-items: center; justify-content: center; background: #eee; border-radius: 8px;
        color: #999; font-size: 11px;
      }
      .grid-item .sprite-placeholder { width: 64px; height: 64px; }
      .card .sprite-placeholder { width: 160px; height: 160px; }
      .card h2 { margin: 0; text-transform: capitalize; }
      .types { display: flex; gap: 4px; }
      .type-badge {
        font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #e0e0e0; text-transform: capitalize;
      }
      .stats { width: 100%; max-width: 280px; display: flex; flex-direction: column; gap: 4px; }
      .stat-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
      .stat-row .label { width: 90px; text-transform: capitalize; }
      .stat-row .bar { flex: 1; height: 8px; background: #eee; border-radius: 4px; overflow: hidden; }
      .stat-row .bar-fill { height: 100%; background: #4a90d9; }
    </style>
  </head>
  <body>
    <div id="root">Carregando Pokédex…</div>
    <script type="module" src="./src/mcp-app.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Replace `src/ui/pokedex/src/mcp-app.ts` with the grid/card implementation**

```typescript
// src/ui/pokedex/src/mcp-app.ts
import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

interface SearchResultItem {
  id: number;
  name: string;
  sprite: string | null;
  types: string[];
}

interface ViewPokemon {
  id: number;
  name: string;
  sprite: string | null;
  height_decimeters: number;
  weight_hectograms: number;
  types: string[];
  abilities: { name: string; is_hidden: boolean }[];
  base_stats: Record<string, number>;
  pokedex_description: string | null;
  is_legendary: boolean;
  is_mythical: boolean;
  evolves_from: string | null;
}

const rootEl = document.getElementById("root")!;
const MAX_BASE_STAT = 255; // teto oficial de base stat na PokéAPI — usado só pra escalar a barra visualmente

/** Creates an <img>; if the sprite is missing or fails to load, swaps in a text placeholder instead. */
function createSpriteElement(src: string | null, alt: string): HTMLElement {
  if (!src) {
    const placeholder = document.createElement("div");
    placeholder.className = "sprite-placeholder";
    placeholder.textContent = "?";
    return placeholder;
  }

  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.addEventListener(
    "error",
    () => {
      const placeholder = document.createElement("div");
      placeholder.className = "sprite-placeholder";
      placeholder.textContent = "?";
      img.replaceWith(placeholder);
    },
    { once: true },
  );
  return img;
}

function renderEmpty(message: string) {
  rootEl.innerHTML = `<div class="empty"></div>`;
  rootEl.querySelector(".empty")!.textContent = message;
}

function renderError(message: string) {
  rootEl.innerHTML = `<div class="error"></div>`;
  rootEl.querySelector(".error")!.textContent = message;
}

function renderGrid(results: SearchResultItem[]) {
  if (results.length === 0) {
    renderEmpty("Nenhum Pokémon encontrado.");
    return;
  }

  rootEl.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "grid";

  for (const item of results) {
    const button = document.createElement("button");
    button.className = "grid-item";

    const sprite = createSpriteElement(item.sprite, item.name);
    const span = document.createElement("span");
    span.textContent = item.name;

    button.appendChild(sprite);
    button.appendChild(span);
    button.addEventListener("click", () => {
      void openDetail(item.name);
    });
    grid.appendChild(button);
  }

  rootEl.appendChild(grid);
}

function renderCard(pokemon: ViewPokemon) {
  rootEl.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card";

  const sprite = createSpriteElement(pokemon.sprite, pokemon.name);

  const h2 = document.createElement("h2");
  h2.textContent = `${pokemon.name} #${pokemon.id}`;

  const typesEl = document.createElement("div");
  typesEl.className = "types";
  for (const t of pokemon.types) {
    const badge = document.createElement("span");
    badge.className = "type-badge";
    badge.textContent = t;
    typesEl.appendChild(badge);
  }

  const statsEl = document.createElement("div");
  statsEl.className = "stats";
  for (const [label, value] of Object.entries(pokemon.base_stats)) {
    const pct = Math.min(100, Math.round((value / MAX_BASE_STAT) * 100));
    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `<span class="label"></span><span class="bar"><span class="bar-fill"></span></span><span class="value"></span>`;
    row.querySelector(".label")!.textContent = label;
    (row.querySelector(".bar-fill") as HTMLElement).style.width = `${pct}%`;
    row.querySelector(".value")!.textContent = String(value);
    statsEl.appendChild(row);
  }

  card.appendChild(sprite);
  card.appendChild(h2);
  card.appendChild(typesEl);
  card.appendChild(statsEl);

  if (pokemon.pokedex_description) {
    const desc = document.createElement("p");
    desc.textContent = pokemon.pokedex_description;
    card.appendChild(desc);
  }

  rootEl.appendChild(card);
}

function renderFromResult(result: CallToolResult) {
  if (result.isError) {
    const text = result.content?.find((c) => c.type === "text")?.text ?? "Erro ao carregar dados.";
    renderError(text);
    return;
  }

  const sc = result.structuredContent as { results?: SearchResultItem[]; pokemon?: ViewPokemon } | undefined;
  if (!sc) return;

  if (Array.isArray(sc.results)) {
    renderGrid(sc.results);
  } else if (sc.pokemon) {
    renderCard(sc.pokemon);
  }
}

async function openDetail(nameOrId: string) {
  try {
    const result = await app.callServerTool({
      name: "pokedex_view",
      arguments: { name_or_id: nameOrId },
    });
    renderFromResult(result);
  } catch (err) {
    renderError(err instanceof Error ? err.message : String(err));
  }
}

const app = new App({ name: "Pokedex App", version: "1.0.0" });

// Registrado antes de connect() pra não perder o resultado inicial da tool que abriu a UI
// (pokedex_search OU pokedex_view — as duas usam este mesmo resource).
app.ontoolresult = (result) => {
  renderFromResult(result);
};

app.onerror = (err) => {
  console.error(err);
};

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
};

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx?.theme) applyDocumentTheme(ctx.theme);
});
```

- [ ] **Step 3: Rebuild the UI bundle**

Run: `cd /Users/gfontes/Documents/projects/pokemon && npm run build:ui`
Expected: exits 0, regenerates `src/ui/pokedex/dist/mcp-app.html`.

Run: `grep -c "grid-item" /Users/gfontes/Documents/projects/pokemon/src/ui/pokedex/dist/mcp-app.html`
Expected: `1` or more — confirms the new grid/card code was bundled in (the placeholder from Task 3 had no `grid-item` string at all).

- [ ] **Step 4: Run the full build to confirm nothing broke server-side**

Run: `cd /Users/gfontes/Documents/projects/pokemon && npm run build`
Expected: exits 0.

- [ ] **Step 5: Verify the bundled resource content via the same MCP client approach as Task 4**

Write this script to `/tmp/verify-task5.mjs`:

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/Users/gfontes/Documents/projects/pokemon/dist/index.js"],
});
const client = new Client({ name: "verify-task5", version: "1.0.0" });
await client.connect(transport);

const resource = await client.readResource({ uri: "ui://pokedex/mcp-app.html" });
const html = resource.contents[0].text;

let failed = false;
const check = (ok, msg) => {
  if (!ok) {
    console.error("FALHOU:", msg);
    failed = true;
  }
};

check(html.includes("grid-item"), "HTML bundlado deveria conter a classe grid-item");
check(html.includes("card"), "HTML bundlado deveria conter a classe card");
check(html.includes("callServerTool"), "HTML bundlado deveria conter a chamada callServerTool (navegação grid->card)");
check(!html.includes('src="./src/mcp-app.ts"'), "HTML bundlado NÃO deveria referenciar o .ts fonte solto — deve estar tudo inline (single-file)");

if (failed) {
  console.error("Task 5: FALHOU");
  process.exit(1);
}
console.log("Task 5 OK: UI bundlada contém grid, card e navegação.");
await client.close();
process.exit(0);
```

Run: `cd /Users/gfontes/Documents/projects/pokemon && node /tmp/verify-task5.mjs`
Expected: `Task 5 OK: UI bundlada contém grid, card e navegação.` (exit code 0, no "FALHOU" lines).

**Note for the human controller (not part of the subagent's task):** this step verifies the bundle's *content*, not its *visual rendering* — no automated test in this plan opens a real MCP Apps host (Claude Desktop or the `ext-apps` reference host), because that requires a GUI no subagent has access to. After Task 6 completes, manually connect this server to an Apps-capable host and visually confirm: `pokedex_search "char"` renders a grid with loading sprites, clicking a result opens the card without a visible host re-render, and `pokedex_view "Pikachu"` opens directly in card mode.

- [ ] **Step 6: Commit**

```bash
cd /Users/gfontes/Documents/projects/pokemon
git add src/ui/pokedex/mcp-app.html src/ui/pokedex/src/mcp-app.ts
git commit -m "Implement pokedex grid/card UI with click-to-detail navigation"
```

---

### Task 6: Documentation and end-to-end verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing new — this task only documents and re-verifies what Tasks 1-5 built.
- Produces: nothing consumed elsewhere — this is the plan's final task.

- [ ] **Step 1: Add a new README section documenting the two MCP App tools**

In `README.md`, after the existing "Tools disponíveis — Pokémon GO (PoGo API)" table (and before "## Instalação e build"), add:

```markdown
## MCP App — Pokédex visual (PokéAPI)

Além das tools de dados acima, o servidor expõe o primeiro **MCP App** do projeto: duas tools que, em hosts com suporte a [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) (ex: Claude Desktop), abrem uma interface visual em vez de só retornar JSON.

| Tool | O que faz |
|---|---|
| `pokedex_search` | Busca por nome/tipo/geração (mesmos filtros de `search_pokemon`) e mostra os resultados numa grade clicável (sprite, nome, tipos). Clicar num resultado abre o card de detalhe. |
| `pokedex_view` | Perfil visual de um Pokémon (sprite, tipos, stats em barra, descrição) — chamável direto ou a partir de um clique em `pokedex_search`. |

As duas compartilham um único recurso de UI (`ui://pokedex/mcp-app.html`); `get_pokemon` e `search_pokemon` continuam existindo sem alteração, para quando só uma resposta em texto for necessária.

Em hosts sem suporte a MCP Apps, ambas as tools continuam retornando dados estruturados/texto normalmente — a UI é um complemento, não um requisito.
```

- [ ] **Step 2: Run the complete verification suite in order**

Run, in sequence, checking each exits 0 before moving to the next:

```bash
cd /Users/gfontes/Documents/projects/pokemon
npm run build
node /tmp/verify-task1.mjs
node /tmp/verify-task2.mjs
node /tmp/verify-task4.mjs
node /tmp/verify-task5.mjs
```

Expected: all four scripts print their respective `Task N OK: ...` line and the command sequence exits 0 with no `FALHOU` output anywhere.

- [ ] **Step 3: Confirm the 15 existing tools still register correctly (no regression)**

Write this script to `/tmp/verify-tool-count.mjs`:

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/Users/gfontes/Documents/projects/pokemon/dist/index.js"],
});
const client = new Client({ name: "verify-tool-count", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();

const expected = [
  "get_ability", "get_evolution_chain", "get_item", "get_move", "get_pokemon",
  "get_pokemon_moves", "get_type", "search_pokemon",
  "go_get_community_days", "go_get_evolution", "go_get_move", "go_get_pokemon",
  "go_get_pokemon_moves", "go_get_raid_bosses", "go_estimate_iv",
  "pokedex_search", "pokedex_view",
].sort();

const missing = expected.filter((n) => !names.includes(n));
if (missing.length > 0) {
  console.error("FALHOU: tools faltando:", missing);
  process.exit(1);
}
console.log(`OK: todas as ${expected.length} tools esperadas (15 existentes + 2 novas) estão registradas.`);
await client.close();
process.exit(0);
```

Run: `cd /Users/gfontes/Documents/projects/pokemon && node /tmp/verify-tool-count.mjs`
Expected: `OK: todas as 17 tools esperadas (15 existentes + 2 novas) estão registradas.`

- [ ] **Step 4: Commit**

```bash
cd /Users/gfontes/Documents/projects/pokemon
git add README.md
git commit -m "Document pokedex_search/pokedex_view MCP App tools"
```
