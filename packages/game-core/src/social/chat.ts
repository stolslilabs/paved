// The messaging rules (#955), pure: who may write where, the length, the rate limits, who may delete or report what, the
// private conversations' requests, the mutes and the word filter. The mock applies them today
// (`packages/app/src/data/mock/chat.ts`) and a service mirrors them later (#956). Every check answers null when the action is
// allowed, else its typed reason (`ChatRefusal`), which the source returns and the pages show.
//
// Three kinds of conversation: the World (every player), a guild's (its members only, #953) and a private one per pair of
// players. A private conversation is open between friends (#954) and guildmates; from anyone else it waits in the recipient's
// Requests until they reply or accept (open point 2's default). A block, either way, stops it (#954).

import { GUILD_RANK, ranksAbove, type GuildRank } from "./guild";
import { playerKey } from "./follow";

// --- Limits ----------------------------------------------------------------------------------------------------------

/** A message, at most, in characters (code points: an emoji counts once). Open point 4's default. */
export const CHAT_MESSAGE_MAX = 200;
/** Writing in the World needs this level (open point 3's default, against throwaway accounts). */
export const CHAT_WORLD_MIN_LEVEL = 2;
/** In the World: one message per 5 seconds, and at most 10 in a minute (open point 4's default). */
export const CHAT_WORLD_INTERVAL_S = 5;
export const CHAT_WORLD_PER_MINUTE = 10;
/** In a guild's and a private conversation: one message per 2 seconds. */
export const CHAT_INTERVAL_S = 2;
/** The messages kept (open point 6's default on the mock): the World's last 200, a guild's last 500, every private one. */
export const CHAT_KEPT = { world: 200, guild: 500, private: Number.POSITIVE_INFINITY } as const;
/** What the word filter puts in place of a listed word. */
export const CHAT_FILTER_MASK = "•••";
/** Why a message is reported. */
export const CHAT_REPORT_REASONS = ["spam", "scam", "harassment", "other"] as const;
/** A page of a conversation: the messages read at once, the latest first, the older ones on scrolling up. */
export const CHAT_PAGE_SIZE = 50;

// --- Conversations ---------------------------------------------------------------------------------------------------

/** The kinds of conversation. */
export type ChatKind = "world" | "guild" | "private";

/** A report's reason. */
export type ChatReportReason = (typeof CHAT_REPORT_REASONS)[number];

/**
 * A conversation's ID, a string a socket can carry (#956): `world`, `guild:<id>`, or `dm:<a>:<b>`, the two players' keys
 * (`playerKey`) in order, so that both players name the one conversation alike.
 */
export type ConversationId = string;

/** What a conversation's ID names. */
export type Conversation = { kind: "world" } | { kind: "guild"; guild: number } | { kind: "private"; players: readonly [string, string] };

/** The World's ID. */
export const WORLD_CONVERSATION: ConversationId = "world";

/** A guild's conversation. */
export const guildConversation = (guild: number): ConversationId => `guild:${guild}`;

/** The private conversation of two players, whatever the form of their addresses and their order. */
export function privateConversation(a: string, b: string): ConversationId {
  const [x, y] = [playerKey(a), playerKey(b)].sort();
  return `dm:${x}:${y}`;
}

/** What `id` names, or null when it is not a conversation's ID (a private one of a player and themselves included). */
export function parseConversation(id: string): Conversation | null {
  if (id === WORLD_CONVERSATION) return { kind: "world" };
  const guild = /^guild:(\d{1,15})$/.exec(id);
  if (guild) return { kind: "guild", guild: Number(guild[1]) };
  const dm = /^dm:([^:]+):([^:]+)$/.exec(id);
  if (!dm || dm[1] === dm[2] || privateConversation(dm[1]!, dm[2]!) !== id) return null;
  return { kind: "private", players: [dm[1]!, dm[2]!] };
}

/** The other player of a private conversation, as `player` sees it, or null when it is not theirs (or not private). */
export function otherPlayer(id: ConversationId, player: string): string | null {
  const c = parseConversation(id);
  if (c?.kind !== "private") return null;
  const me = playerKey(player);
  if (c.players[0] === me) return c.players[1];
  if (c.players[1] === me) return c.players[0];
  return null;
}

// --- Refusals --------------------------------------------------------------------------------------------------------

/** Why a chat action is refused. */
export type ChatRefusal =
  /** The text is blank once trimmed. */
  | "empty"
  /** Over `CHAT_MESSAGE_MAX` characters. */
  | "too-long"
  /** The World needs level `CHAT_WORLD_MIN_LEVEL`. */
  | "level-low"
  /** Sooner than the interval after the sender's last message there (`nextSendAt` says when). */
  | "too-fast"
  /** The World's 10 messages in a minute are reached. */
  | "per-minute"
  /** The same text as the sender's last message in the World. */
  | "repeat"
  /** A guild's conversation: the player is not one of its members. */
  | "not-in-guild"
  /** A private conversation that is not the player's own (of two other players), or of a player and themselves. */
  | "not-yours"
  /** The player blocks the other (they unblock first, #954). */
  | "blocking"
  /** The other blocks the player: never shown as such (the block stays hidden, #954), the page says only that it is not available. */
  | "blocked"
  /** The other declined the player's request: shown as `blocked` is, not available. */
  | "declined"
  /** Deleting another's message, outside a guild or without the rank. */
  | "not-author"
  /** A guild's officer or leader deleting a message of a member not below them. */
  | "rank-not-above"
  /** The message is deleted already. */
  | "deleted"
  /** Reporting one's own message. */
  | "self"
  /** The player reported this message already. */
  | "reported-already"
  /** Not one of `CHAT_REPORT_REASONS`. */
  | "reason"
  /** Accepting or declining what is not a request waiting for the player. */
  | "not-a-request"
  /** No conversation, message or player of that ID. */
  | "not-found";

// --- Text ------------------------------------------------------------------------------------------------------------

/** The characters of a text, as the limit counts them: code points, so an emoji is one. */
export const chatLength = (text: string): number => [...text].length;

/**
 * A message as it is kept: plain text, trimmed, its control characters dropped and its runs of white space made one space (a
 * message is one line). Links and addresses stay as typed: the pages show them as plain text, never as links (#955, against
 * phishing in a game with tokens).
 */
export const normalMessage = (text: string): string =>
  text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Why a text is refused (`empty`, `too-long`), or null; on its normal form (`normalMessage`). */
export function messageTextRefusal(text: string): ChatRefusal | null {
  const normal = normalMessage(text);
  if (normal === "") return "empty";
  if (chatLength(normal) > CHAT_MESSAGE_MAX) return "too-long";
  return null;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The text with each listed word (whatever its case, as a whole word: "class" is not "ass") put as `CHAT_FILTER_MASK`. The list
 * sits in the client on the mock; the service filters later (#956).
 */
export function filterWords(text: string, words: readonly string[]): string {
  const listed = words.map((w) => w.trim()).filter((w) => w !== "");
  if (listed.length === 0) return text;
  // Longest first, so that a longer listed word is masked whole before a shorter one inside it.
  const alternatives = [...listed].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  return text.replace(pattern, CHAT_FILTER_MASK);
}

// --- Rate limits -----------------------------------------------------------------------------------------------------

/** One of the sender's own messages in a conversation, as the rate limits read it: when, and its text. */
export interface SentMessage {
  at: number;
  text: string;
}

/** The interval between two messages of a sender in a conversation of `kind`, in seconds. */
export const chatInterval = (kind: ChatKind): number => (kind === "world" ? CHAT_WORLD_INTERVAL_S : CHAT_INTERVAL_S);

/**
 * When the sender may write next in a conversation of `kind` (seconds; `now` when at once), from their own messages there
 * (`sent`, any order): the interval after the last one and, in the World, a minute after the 10th latest when 10 fall within
 * the last minute.
 */
export function nextSendAt(kind: ChatKind, sent: readonly SentMessage[], now: number): number {
  if (sent.length === 0) return now;
  const times = sent.map((m) => m.at).sort((a, b) => b - a);
  let next = times[0]! + chatInterval(kind);
  if (kind === "world") {
    const tenth = times[CHAT_WORLD_PER_MINUTE - 1];
    if (tenth !== undefined && now - tenth < 60) next = Math.max(next, tenth + 60);
  }
  return Math.max(now, next);
}

/**
 * Why the rate limits refuse a message now, or null: `too-fast` within the interval; in the World, `per-minute` past 10 in the
 * last minute and `repeat` for the same text as the sender's last message there (whatever its case and spaces).
 */
export function rateRefusal(kind: ChatKind, sent: readonly SentMessage[], text: string, now: number): ChatRefusal | null {
  if (sent.length === 0) return null;
  const ordered = [...sent].sort((a, b) => b.at - a.at);
  if (now - ordered[0]!.at < chatInterval(kind)) return "too-fast";
  if (kind !== "world") return null;
  if (ordered.filter((m) => now - m.at < 60).length >= CHAT_WORLD_PER_MINUTE) return "per-minute";
  if (normalMessage(ordered[0]!.text).toLowerCase() === normalMessage(text).toLowerCase()) return "repeat";
  return null;
}

// --- Who may write where ---------------------------------------------------------------------------------------------

/**
 * A private conversation as one of its players sees it:
 * - `open`: they are friends or guildmates (`related`), or the player wrote in it or accepted it;
 * - `request`: the other wrote and the player did neither: it waits in their Requests;
 * - `declined`: the player declined the other's request: it is gone from their lists;
 * - `none`: nothing yet (no message of the other).
 */
export type PrivateStanding = "open" | "request" | "declined" | "none";

/** What a player's side of a private conversation keeps. */
export interface PrivateSide {
  /** The player wrote in it or accepted the other's request. */
  accepted: boolean;
  /** The player declined the other's request (cleared once they write or accept). */
  declined: boolean;
}

/** A private conversation between `player` and the other, as the rules read it. */
export interface PrivatePair {
  /** Friends (a mutual follow, #954) or guildmates (#953). */
  related: boolean;
  /** The player's side and the other's. */
  mine: PrivateSide;
  theirs: PrivateSide;
  /** Whether the other wrote in it (a message not deleted or deleted alike). */
  theyWrote: boolean;
  /** A block between the two: the player blocks the other, the other blocks the player, or none (`blockBetween`, #954). */
  block: "blocking" | "blocked" | null;
}

/** The player's standing in a private conversation (`PrivateStanding`). */
export function privateStanding(pair: Pick<PrivatePair, "related" | "mine" | "theyWrote">): PrivateStanding {
  if (pair.related || pair.mine.accepted) return "open";
  if (pair.mine.declined) return "declined";
  return pair.theyWrote ? "request" : "none";
}

/**
 * Whether the player's message reaches the other's conversation (true) or waits in their Requests (false): it reaches them
 * when they are related, or the other wrote in it or accepted it.
 */
export const reachesDirectly = (pair: Pick<PrivatePair, "related" | "theirs">): boolean => pair.related || pair.theirs.accepted;

/**
 * Why the player may not write to the other in private, or null: no block either way (#954), and not after the other declined
 * the player's request while they are not related. A request may be sent to anyone else; it waits in their Requests.
 */
export function privateRefusal(pair: PrivatePair): ChatRefusal | null {
  if (pair.block) return pair.block;
  if (!pair.related && !pair.theirs.accepted && pair.theirs.declined) return "declined";
  return null;
}

/** The sender, as the checks on writing read them. */
export interface ChatSender {
  level: number;
  /** The guild they are in, or null. */
  guild: number | null;
}

/**
 * Why a message is refused, or null: its text (`messageTextRefusal`), who may write there, then the rate limits on the sender's
 * own messages in that conversation (`sent`). The World needs level 2; a guild's conversation, its membership; a private one,
 * `privateRefusal` on its pair (`pair`, required for a private conversation).
 */
export function sendRefusal(conversation: Conversation, sender: ChatSender, text: string, sent: readonly SentMessage[], now: number, pair?: PrivatePair): ChatRefusal | null {
  const refused = messageTextRefusal(text);
  if (refused) return refused;
  if (conversation.kind === "world" && sender.level < CHAT_WORLD_MIN_LEVEL) return "level-low";
  if (conversation.kind === "guild" && sender.guild !== conversation.guild) return "not-in-guild";
  if (conversation.kind === "private") {
    if (!pair) return "not-found";
    const blocked = privateRefusal(pair);
    if (blocked) return blocked;
  }
  return rateRefusal(conversation.kind, sent, text, now);
}

/** Whether `player` may read a conversation: anyone the World, a guild's its members, a private one its two players. */
export function mayRead(conversation: Conversation, player: string, guild: number | null): boolean {
  if (conversation.kind === "world") return true;
  if (conversation.kind === "guild") return guild === conversation.guild;
  const me = playerKey(player);
  return conversation.players.includes(me);
}

// --- Requests --------------------------------------------------------------------------------------------------------

/** Accepting or declining the other's request: only a request waiting for the player (`privateStanding` is `request`). */
export const answerRequestRefusal = (pair: Pick<PrivatePair, "related" | "mine" | "theyWrote">): ChatRefusal | null =>
  privateStanding(pair) === "request" ? null : "not-a-request";

// --- Deleting and reporting ------------------------------------------------------------------------------------------

/** A message as the checks on deleting and reporting read it. */
export interface ChatMessageRef {
  author: string;
  deleted: boolean;
}

/**
 * Who is deleting a message: their address and, in a guild's conversation, their rank and the author's (null: the author is no
 * longer a member, and ranks below every member).
 */
export interface ChatDeleter {
  address: string;
  /** In a guild's conversation: the deleter's rank there; null elsewhere or outside the guild. */
  rank?: GuildRank | null;
  authorRank?: GuildRank | null;
}

/**
 * Deleting a message: the sender their own, anywhere; in a guild's conversation, also an officer or the leader a message of a
 * member they rank strictly above (#953's rank rule), a former member's included. A deleted message shows "Message deleted".
 */
export function deleteRefusal(kind: ChatKind, actor: ChatDeleter, message: ChatMessageRef): ChatRefusal | null {
  if (message.deleted) return "deleted";
  if (playerKey(actor.address) === playerKey(message.author)) return null;
  if (kind !== "guild" || actor.rank === null || actor.rank === undefined || actor.rank < GUILD_RANK.officer) return "not-author";
  const author = actor.authorRank ?? 0;
  return ranksAbove(actor.rank, author as GuildRank) ? null : "rank-not-above";
}

/** Reporting a message: another's, not deleted, with one of `CHAT_REPORT_REASONS`, once per player. The mock records it. */
export function reportRefusal(reporter: string, message: ChatMessageRef, reason: string, reportedAlready: boolean): ChatRefusal | null {
  if (playerKey(reporter) === playerKey(message.author)) return "self";
  if (message.deleted) return "deleted";
  if (!(CHAT_REPORT_REASONS as readonly string[]).includes(reason)) return "reason";
  if (reportedAlready) return "reported-already";
  return null;
}

// --- Mutes and what is shown -----------------------------------------------------------------------------------------

/** One player's mute of another, since `at` (seconds). Private to the muter, and undone at will. */
export interface Mute {
  muter: string;
  muted: string;
  at: number;
}

/** Whether `viewer` mutes `author`. */
export const isMuted = (mutes: readonly Mute[], viewer: string, author: string): boolean =>
  mutes.some((m) => playerKey(m.muter) === playerKey(viewer) && playerKey(m.muted) === playerKey(author));

/** Muting `target`: not oneself. Muting twice is a no-op. */
export const muteRefusal = (player: string, target: string): ChatRefusal | null => (playerKey(player) === playerKey(target) ? "self" : null);

/**
 * Whether a message of `author` is hidden from `viewer` in a conversation of `kind`: never their own; anywhere when the viewer
 * blocks the author (#954); in the World and a guild's, also when the viewer mutes them (a mute leaves private messages be).
 */
export function hiddenFrom(kind: ChatKind, viewer: string, author: string, rel: { blocking: boolean; muted: boolean }): boolean {
  if (playerKey(viewer) === playerKey(author)) return false;
  if (rel.blocking) return true;
  return kind !== "private" && rel.muted;
}

// --- Keeping, reading, listing ---------------------------------------------------------------------------------------

/** The messages a conversation of `kind` keeps (`CHAT_KEPT`): the latest, oldest first. */
export const keepMessages = <T extends { at: number }>(kind: ChatKind, messages: readonly T[]): T[] => {
  const kept = CHAT_KEPT[kind];
  return Number.isFinite(kept) ? messages.slice(Math.max(0, messages.length - kept)) : [...messages];
};

/** How many messages `reader` has not read: those of others after `readAt` (seconds), not deleted. */
export const unreadMessages = (messages: readonly { at: number; author: string | null; deleted?: boolean }[], reader: string, readAt: number): number =>
  messages.filter((m) => m.at > readAt && m.author !== null && !m.deleted && playerKey(m.author) !== playerKey(reader)).length;

/**
 * The Chat tab's badge (and so the Social button's, #952): the guild's unread messages, the open private conversations' and
 * one for each request waiting. The World never badges.
 */
export const chatBadge = (unread: { guild: number; private: readonly number[]; requests: number }): number =>
  unread.guild + unread.private.reduce((sum, n) => sum + n, 0) + unread.requests;

/** A conversation as the Chat tab lists it. */
export interface ListedConversation {
  kind: ChatKind;
  /** Its last message's time, or null when it has none. */
  lastAt: number | null;
}

/** The Chat tab's order: the World, the guild's, then the private conversations by their last message, the latest first. */
export const sortConversations = <T extends ListedConversation>(list: readonly T[]): T[] => {
  const order: Record<ChatKind, number> = { world: 0, guild: 1, private: 2 };
  return [...list].sort((a, b) => order[a.kind] - order[b.kind] || (b.lastAt ?? -1) - (a.lastAt ?? -1));
};

/**
 * A page of a conversation (its messages oldest first): the `size` latest before the cursor (`before`: a message's `at` and
 * `id`, exclusive; null: the latest), and the cursor of the page before it, or null when there is none.
 */
export function chatPage<T extends { at: number; id: string }>(messages: readonly T[], before: { at: number; id: string } | null, size = CHAT_PAGE_SIZE): { messages: T[]; before: { at: number; id: string } | null } {
  const ordered = [...messages].sort(compareMessages);
  const end = before === null ? ordered.length : ordered.findIndex((m) => compareMessages(m, before) >= 0);
  const stop = end < 0 ? ordered.length : end;
  const start = Math.max(0, stop - Math.max(1, size));
  const page = ordered.slice(start, stop);
  return { messages: page, before: start > 0 && page.length > 0 ? { at: page[0]!.at, id: page[0]!.id } : null };
}

/** The order of a conversation's messages: by time, then by ID. */
export const compareMessages = (a: { at: number; id: string }, b: { at: number; id: string }): number => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
