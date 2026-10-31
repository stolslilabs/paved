// The player search (#952): by name, from the start of a word and whatever the case, or by player ID. Pure, so that the mock
// applies it today and a service can mirror it later (#956).

/** The most results a search answers. */
export const SEARCH_LIMIT = 20;

/** The longest player ID: a felt, 252 bits, so at most 63 hex digits (64 with a leading zero). */
const MAX_ID_DIGITS = 64;

const isLower = (c: string) => c >= "a" && c <= "z";
const isUpper = (c: string) => c >= "A" && c <= "Z";
const isDigit = (c: string) => c >= "0" && c <= "9";
const isAlnum = (c: string) => isLower(c) || isUpper(c) || isDigit(c);

/**
 * Where the words of a name start: its first letter or digit, one after a space or a sign ("Old Tom", "millstone_mara",
 * "kestrel.eth"), a capital after a small letter ("ChillyNewt"), and a run of digits after letters ("Newt46").
 */
export function wordStarts(name: string): number[] {
  const starts: number[] = [];
  for (let i = 0; i < name.length; i++) {
    const c = name[i]!;
    if (!isAlnum(c)) continue;
    const prev = i > 0 ? name[i - 1]! : "";
    if (prev === "" || !isAlnum(prev) || (isUpper(c) && isLower(prev)) || (isDigit(c) && !isDigit(prev)) || (!isDigit(c) && isDigit(prev))) starts.push(i);
  }
  return starts;
}

/** A query as the search reads it: trimmed, its runs of spaces made one, in small letters. */
export const normalQuery = (query: string): string => query.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Whether `name` matches `query` by name: the query, whatever the case, starts at the start of one of the name's words
 * ("newt" and "46" find "ChillyNewt46", "tom c" finds "Old Tom Cobble", "ewt" finds neither). An empty query matches nothing.
 */
export function nameMatches(name: string, query: string): boolean {
  const q = normalQuery(query);
  if (q === "") return false;
  const lower = name.toLowerCase();
  return wordStarts(name).some((i) => lower.startsWith(q, i));
}

/**
 * The player ID a query names, as one form (`0x`, small hex digits, no leading zero), or null when the query is not an ID:
 * `0x` then 1 to 64 hex digits, whatever the case and the spaces around.
 */
export function parsePlayerId(query: string): string | null {
  const q = query.trim();
  if (!/^0x[0-9a-f]+$/i.test(q) || q.length - 2 > MAX_ID_DIGITS) return null;
  return `0x${BigInt(q).toString(16)}`;
}

/** What the search reads of a player. */
export interface Searchable {
  address: string;
  name: string | null;
}

/**
 * The players `query` finds among `players`, at most `limit`: by ID, the one player of that ID; else by name (`nameMatches`),
 * those whose name starts with the query first, then the others, each group in its given order. A player without a name is
 * found by ID only.
 */
export function searchPlayers<T extends Searchable>(players: readonly T[], query: string, limit = SEARCH_LIMIT): T[] {
  const id = parsePlayerId(query);
  if (id !== null) {
    const found = players.find((p) => {
      try {
        return BigInt(p.address) === BigInt(id);
      } catch {
        return false;
      }
    });
    return found ? [found] : [];
  }
  const q = normalQuery(query);
  const matched = players.filter((p) => p.name !== null && nameMatches(p.name, q));
  const first = matched.filter((p) => p.name!.toLowerCase().startsWith(q));
  const rest = matched.filter((p) => !p.name!.toLowerCase().startsWith(q));
  return [...first, ...rest].slice(0, Math.max(0, limit));
}
