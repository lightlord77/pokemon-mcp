const BASE_URL = "https://pokeapi.co/api/v2";
const CACHE_TTL_MS = 10 * 60 * 1000; // PokéAPI's fair-use policy asks clients to cache responses.

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export class PokeApiNotFoundError extends Error {
  constructor(public readonly resource: string, public readonly identifier: string) {
    super(`${resource} '${identifier}' não encontrado.`);
    this.name = "PokeApiNotFoundError";
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  const response = await fetch(url);
  if (response.status === 404) {
    throw new Error("__NOT_FOUND__");
  }
  if (!response.ok) {
    throw new Error(`PokéAPI retornou status ${response.status} para ${url}`);
  }

  const data = (await response.json()) as T;
  cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

/**
 * Fetches a resource by endpoint + identifier (name or id), normalizing the identifier
 * and translating 404s into a friendly PokeApiNotFoundError.
 */
export async function getResource<T>(endpoint: string, identifier: string | number): Promise<T> {
  const id = normalizeIdentifier(identifier);
  const url = `${BASE_URL}/${endpoint}/${id}`;
  try {
    return await fetchJson<T>(url);
  } catch (err) {
    if (err instanceof Error && err.message === "__NOT_FOUND__") {
      throw new PokeApiNotFoundError(endpoint, String(identifier));
    }
    throw err;
  }
}

/**
 * Fetches an arbitrary resource by its full PokéAPI URL (as embedded in other responses).
 */
export async function getByUrl<T>(url: string): Promise<T> {
  return fetchJson<T>(url);
}

export function normalizeIdentifier(identifier: string | number): string {
  if (typeof identifier === "number") return String(identifier);
  const trimmed = identifier.trim().toLowerCase();
  // Pure numeric strings are passed through untouched (PokéAPI accepts numeric ids).
  if (/^\d+$/.test(trimmed)) return trimmed;
  return trimmed.replace(/\s+/g, "-");
}

/**
 * Fetches a full named-resource list (e.g. every Pokémon or every species name) with a large
 * limit so pagination isn't needed, cached like any other request.
 */
export async function getFullList<T = { count: number; results: { name: string; url: string }[] }>(
  endpoint: string,
): Promise<T> {
  return fetchJson<T>(`${BASE_URL}/${endpoint}?limit=100000&offset=0`);
}

export { BASE_URL };
