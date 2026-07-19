import type { FlavorTextEntry, PokemonSprites } from "./types.js";

export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Extracts the last URL path segment as a numeric id, e.g. ".../pokemon-species/25/" -> 25 */
export function idFromUrl(url: string): number {
  const match = url.match(/\/(\d+)\/?$/);
  if (!match) throw new Error(`Não foi possível extrair um id da url: ${url}`);
  return Number(match[1]);
}

/**
 * Picks the best available flavor text for a given language, falling back to English,
 * collapses whitespace/form-feed artifacts present in PokéAPI text, and prefers the
 * most recent version entry available.
 */
export function pickFlavorText(entries: FlavorTextEntry[], preferredLang = "pt", fallbackLang = "en"): string | null {
  const clean = (text: string) => text.replace(/[\n\f\r]+/g, " ").replace(/\s+/g, " ").trim();
  const byLang = (lang: string) => entries.filter((e) => e.language.name === lang);

  const preferred = byLang(preferredLang);
  if (preferred.length > 0) return clean(preferred[preferred.length - 1].flavor_text);

  const fallback = byLang(fallbackLang);
  if (fallback.length > 0) return clean(fallback[fallback.length - 1].flavor_text);

  return entries.length > 0 ? clean(entries[0].flavor_text) : null;
}

export function pickAllSprites(sprites: PokemonSprites) {
  return {
    front_default: sprites.front_default,
    front_shiny: sprites.front_shiny,
    back_default: sprites.back_default,
    back_shiny: sprites.back_shiny,
    official_artwork: sprites.other?.["official-artwork"]?.front_default ?? null,
    official_artwork_shiny: sprites.other?.["official-artwork"]?.front_shiny ?? null,
    home: sprites.other?.home?.front_default ?? null,
    home_shiny: sprites.other?.home?.front_shiny ?? null,
    dream_world: sprites.other?.dream_world?.front_default ?? null,
    showdown_animated: sprites.other?.showdown?.front_default ?? null,
    showdown_animated_shiny: sprites.other?.showdown?.front_shiny ?? null,
    showdown_animated_back: sprites.other?.showdown?.back_default ?? null,
  };
}
