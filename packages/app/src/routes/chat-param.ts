import { WORLD_CONVERSATION, otherPlayer } from "@paved/game-core";

// The chat page's URL (#973): `/chat/<tab>` names its tab (World, Guild, Private), `/chat/private/<player>` the private conversation
// open over the Private tab's list. An old link to a conversation (`/chat?chat=<id>`, #955; `/social?chat=` before, which lands
// there) opens the tab it belongs to. Plain literals and functions: the profile's chunk (Message) carries this module, the home's
// first load does not.

/** The chat page's three tabs, left to right (#973). */
export type ChatTab = "world" | "guild" | "private";

export const CHAT_TAB_IDS: readonly ChatTab[] = ["world", "guild", "private"];

/** A path's or a stored value's tab, or null for anything else. */
export const chatTabOf = (value: string | null | undefined): ChatTab | null => CHAT_TAB_IDS.find((t) => t === value) ?? null;

/** The search parameter of an old link to a conversation (#955): `/chat?chat=<id>`. */
export const CHAT_PARAM = "chat";

/** What an opening leaves in the history entry: Back then goes back, so the list's entry is not left twice. */
export interface ChatSheetState {
  chatSheet?: true;
}

/** The conversation ID a parameter names (its shape only: the source says whether the player may read it), or null. */
export const chatParamOf = (value: string | null): string | null => (value !== null && /^(world|guild:\d{1,15}|dm:[^:\s]{1,80}:[^:\s]{1,80})$/.test(value) ? value : null);

/** A player's ID as a path names it (an address, or a device player's): no separator, no space. */
export const chatPlayerOf = (value: string | null | undefined): string | null => (value && /^[^:/\s?#]{1,80}$/.test(value) ? value : null);

/** The chat page on `tab`. */
export const chatTabPath = (tab: ChatTab): string => `/chat/${tab}`;

/** The private conversation with `player`, over the Private tab's list. */
export const privateChatPath = (player: string): string => `/chat/private/${encodeURIComponent(player)}`;

/**
 * Where an old link to the conversation `id` lands for `me`: the World's tab, the Guild's, or the private conversation with the
 * other player (the Private tab's list when the conversation is not the player's).
 */
export function chatPathOf(id: string, me: string): string {
  if (id === WORLD_CONVERSATION) return chatTabPath("world");
  if (id.startsWith("guild:")) return chatTabPath("guild");
  const other = otherPlayer(id, me);
  return other === null ? chatTabPath("private") : privateChatPath(other);
}
