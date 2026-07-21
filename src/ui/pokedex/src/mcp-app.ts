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

// Guarda o último grid renderizado (via busca) pra permitir "voltar" a partir de um card ou de um erro.
// Continua null se pokedex_view foi chamado direto (sem passar por pokedex_search) — nesse caso não há pra onde voltar.
let lastGrid: SearchResultItem[] | null = null;

/** Cria o botão "← Voltar" que re-renderiza o último grid. Retorna null se não há grid anterior. */
function createBackButton(): HTMLElement | null {
  if (!lastGrid) return null;
  const grid = lastGrid;
  const button = document.createElement("button");
  button.className = "back-button";
  button.textContent = "← Voltar";
  button.addEventListener("click", () => {
    renderGrid(grid);
  });
  return button;
}

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
  rootEl.innerHTML = "";

  const backButton = createBackButton();
  if (backButton) rootEl.appendChild(backButton);

  const error = document.createElement("div");
  error.className = "error";
  error.textContent = message;
  rootEl.appendChild(error);
}

function renderGrid(results: SearchResultItem[]) {
  lastGrid = results;

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

  const backButton = createBackButton();
  if (backButton) rootEl.appendChild(backButton);

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

  const abilitiesEl = document.createElement("div");
  abilitiesEl.className = "abilities";
  for (const ability of pokemon.abilities) {
    const badge = document.createElement("span");
    badge.className = "ability-badge";
    badge.textContent = ability.is_hidden ? `${ability.name} (oculta)` : ability.name;
    abilitiesEl.appendChild(badge);
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

  if (pokemon.evolves_from) {
    const evolution = document.createElement("p");
    evolution.className = "evolution";
    evolution.textContent = `Evolui de ${pokemon.evolves_from}`;
    card.appendChild(evolution);
  }

  if (pokemon.abilities.length > 0) {
    card.appendChild(abilitiesEl);
  }

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
