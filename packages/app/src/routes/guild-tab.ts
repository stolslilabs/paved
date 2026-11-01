// The guild page's tabs (#973): Announcements, Members, Requests (officers and the leader) and Log, and the last one used on this
// device. Plain literals and functions, in the guild page's chunks only.

/** The guild page's tabs, left to right (#973). */
export type GuildTab = "announcements" | "members" | "requests" | "log";

export const GUILD_TAB_IDS: readonly GuildTab[] = ["announcements", "members", "requests", "log"];

/** A stored value's tab, or null for anything else. */
export const guildTabOf = (value: string | null | undefined): GuildTab | null => GUILD_TAB_IDS.find((t) => t === value) ?? null;

const KEY = "guild-tab";

/** Kept beside `localStorage`, as `chat-tab` is: with storage off the choice holds for the visit. */
let memory: GuildTab | null = null;

/** The last tab used on this device, or null the first time, with storage off, or for a value not written here. */
export function guildTabStored(): GuildTab | null {
  if (memory !== null) return memory;
  try {
    return guildTabOf(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/** Keeps the tab. A refused write is not an error: the next visit opens as the first time. */
export function storeGuildTab(tab: GuildTab): void {
  memory = tab;
  try {
    localStorage.setItem(KEY, tab);
  } catch {
    // Storage off: the in-memory choice above is all there is.
  }
}

/** For the tests: forget the in-memory choice. */
export function resetGuildTabForTests(): void {
  memory = null;
}

/**
 * Where the guild page opens (#973): on Announcements while one is unread, else on the last tab used, the first time on Members.
 * Requests is an officer's and the leader's: anyone else stored there opens on Members.
 */
export function openingGuildTab(unread: number, officer: boolean, stored: GuildTab | null = guildTabStored()): GuildTab {
  if (unread > 0) return "announcements";
  if (stored === null || (stored === "requests" && !officer)) return "members";
  return stored;
}
