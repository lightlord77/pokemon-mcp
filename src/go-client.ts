const BASE_URL = "https://pogoapi.net/api/v1";
const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Fetches a full PoGo API data file (each endpoint is a whole JSON document, not per-id). */
export async function getGoData<T>(endpoint: string): Promise<T> {
  const url = `${BASE_URL}/${endpoint}.json`;
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PoGo API retornou status ${response.status} para ${url}`);
  }

  const data = (await response.json()) as T;
  cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}
