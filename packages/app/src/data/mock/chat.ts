import {
  CHAT_KEPT,
  CHAT_PAGE_SIZE,
  CHAT_WORLD_MIN_LEVEL,
  GUILD_RANK,
  WORLD_CONVERSATION,
  answerRequestRefusal,
  areFriends,
  blockBetween,
  chatBadge,
  chatPage,
  compareMessages,
  deleteRefusal,
  filterWords,
  guildConversation,
  guildTag,
  hiddenFrom,
  isBlocking,
  isMuted,
  keepMessages,
  messageTextRefusal,
  muteRefusal,
  nextSendAt,
  normalMessage,
  otherPlayer,
  parseConversation,
  playerKey,
  poseidon,
  privateConversation,
  privateRefusal,
  privateStanding,
  reachesDirectly,
  reportRefusal,
  sendRefusal,
  sortConversations,
  unreadMessages,
  type ChatKind,
  type ChatRefusal,
  type ChatReportReason,
  type Conversation,
  type ConversationId,
  type FollowGraph,
  type GuildRank,
  type Mute,
  type PrivatePair,
  type PrivateSide,
} from "@paved/game-core";
import {
  bytesToHex,
  checkCommitment,
  conversationKey,
  epochDue,
  guildMessageKey,
  hexToBytes,
  labelledKeyPair,
  makeEpoch,
  newKeyPair,
  open,
  openEpoch,
  privateVersions,
  publicOf,
  replayedEnvelopes,
  reportReveal,
  safetyCode,
  seal,
  type EpochMember,
  type EpochRecord,
  type Envelope,
  type MessagingKeyPair,
  type PublicMessagingKey,
} from "@paved/game-core/e2e";
import { ChatRefusedError, type ChatEncryption, type ChatMessage, type ChatOverview, type ChatPage, type ChatPageHead, type ChatWriteRefusal, type ConversationSummary, type GuildAnnouncement, type GuildLogEntry, type PublicProfile } from "../social-source";
import { CHAT_FILTER_WORDS, GUILD_LINES, REPLY_LINES, REQUEST_LINES, WORLD_LINES } from "./chat-lines";
import { community, communityMember } from "./community";
import type { GuildPeople, GuildWorld, StoredGuild, StoredLogEntry } from "./guilds";

// The mock's messages (#955): the World, the guilds' conversations and the private ones of the device, kept in the ledger's
// state (`StoredState.chat`), on game-core's rules (`packages/game-core/src/social/chat.ts`). What the device's players write is
// stored; what the community writes is drawn from Poseidon on the mock's clock, the same on every device for the same minute,
// from the hand-written lines of `chat-lines.ts`, and never stored (a deletion of a drawn line is).
//
// The community's players are on other devices, so the mock plays their part, from the times the state keeps (as `guilds.ts`
// does: `settleChat` applies what is due at each read and before each write, so a read and the next write agree):
// - in the World, a community player of level 2 or more writes in about half the minutes;
// - in a guild's conversation, one of its community members writes in about two slots of five minutes in five;
// - a community player answers a private message with a short line `MOCK_REPLY_MIN_S` to 8 seconds later (open point 5's
//   default), across no block;
// - a stranger of the community sends a request `MOCK_REQUEST_S` after the player's first visit to the Chat tab, so that the
//   flow can be tried.
//
// End-to-end encryption (#997, game-core's `social/e2e.ts`): the private and guild messages are stored sealed, never as text,
// and opened on each read with the reader's keys; the World stays public. Each player has a messaging key (X25519, with a
// version): a device player's is made the first time the chat meets them on this device and kept in the ledger's state, as the
// account's key is; a community player's is derived from their ID (`labelledKeyPair`), so that every device agrees, as the mock
// plays their part. The directory serves each player's latest public key. A guild's messages are sealed with its epoch's key,
// wrapped for each member; a new epoch starts as soon as its members change (a joining, a kick, a leave) or one changes key,
// so that a departed member cannot open what follows, and a joiner reads from their joining on. A report reveals the reported
// message and the 5 before it, each commitment checked as a moderator will. The encryption's code (`@paved/game-core/e2e`) is
// a chunk of its own beside the mock's, fetched with it, never in the home's first load (`vite.config.ts`).

/** A community player answers a private message this long after it at the earliest, and up to 5 seconds later. */
export const MOCK_REPLY_MIN_S = 3;
const MOCK_REPLY_SPREAD_S = 6;
/** A stranger's request comes this long after the player's first visit to the Chat tab. */
export const MOCK_REQUEST_S = 45;
/** The World's draws: one slot a minute, a line in about half of them. */
export const WORLD_SLOT_S = 60;
const WORLD_CHANCE = 0.5;
/** How far back the World's lines are looked for at most, should the draws give fewer than the 200 kept: 30 days. */
const WORLD_LOOKBACK_S = 30 * 86_400;
/** A guild's draws: one slot each 5 minutes, a line in about two in five. */
export const GUILD_SLOT_S = 300;
const GUILD_CHANCE = 0.4;
/** How far ahead a subscriber's next drawn line is looked for. */
const AHEAD_SLOTS = 240;

/** The draws' kinds ('WORLD', 'GUILD', 'REPLY', 'ASK'). */
const WORLD_DRAW = 0x574f524c44n;
const GUILD_DRAW = 0x4755494c44n;
const REPLY_DRAW = 0x5245504c59n;
const REQUEST_DRAW = 0x41534bn;

/** The guild log's kinds shown as lines of the guild's conversation (#955, proposal 3). */
const EVENT_KINDS: ReadonlySet<string> = new Set(["joined", "left", "kicked", "promoted", "leader"]);

/**
 * A message as stored: a device player's, or a community player's the mock made (an answer, a request). The World's holds its
 * text; a guild's or private one holds its envelope only (`sealed`, #997), never its text.
 */
export type StoredChatMessage = { id: string; author: string; at: number; deleted: boolean } & ({ text: string; sealed?: undefined } | { sealed: Envelope; text?: undefined });

/** A message a report reveals (#997, point 7): its text and franking key, and whether its commitment matches (null: public). */
export interface RevealedMessage {
  id: string;
  author: string;
  at: number;
  text: string;
  /** Null: a public line (the World's, a drawn one), with no envelope. */
  frankingKey: string | null;
  commitment: string | null;
  /** The moderator's check of the commitment against the revealed text and key; null for a public line. */
  checked: boolean | null;
}

/** A report: the mock records it (#955, proposal 5), with what it reveals: the message, and in private or a guild the 5 before it. */
export interface StoredReport {
  reporter: string;
  conversation: ConversationId;
  message: string;
  author: string;
  reason: ChatReportReason;
  at: number;
  /** Oldest first, the reported message last. */
  revealed: RevealedMessage[];
}

/** A device player's messaging key, as the device keeps it (hexadecimal). */
export interface StoredKeyPair {
  version: number;
  secretKey: string;
  publicKey: string;
  /** When it was made, in seconds. */
  at: number;
}

/** A messaging key's change: a new version (`rotateKeys`), shown as "<name>'s security key changed" in their conversations. */
export interface KeyChange {
  player: string;
  version: number;
  at: number;
}

/** A device player, as the chat keeps them. */
export interface StoredChatPlayer {
  noticeSeen?: boolean;
  /** Their first visit to the Chat tab, in seconds. */
  firstVisit?: number;
  /** The mock's stranger request came (or was skipped: no stranger left). */
  requested?: boolean;
}

export interface StoredChat {
  version: 2;
  nextId: number;
  /** By conversation, oldest first: the device's messages and the ones the mock made. */
  messages: Record<ConversationId, StoredChatMessage[]>;
  /** By conversation: the drawn lines deleted. */
  deleted: Record<ConversationId, string[]>;
  /** A private conversation's sides, by `conversation|player`. */
  sides: Record<string, PrivateSide>;
  /** When a player last read a conversation, by `conversation|player`, in seconds. */
  reads: Record<string, number>;
  mutes: Mute[];
  reports: StoredReport[];
  /** By player key. */
  players: Record<string, StoredChatPlayer>;
  /**
   * The memberships that ended (a leave, a kick), so that a guild's past lines keep their authors whatever the roster becomes:
   * a drawn line's author is one of the members of that time. Absent: none yet.
   */
  departed?: Departure[];
  /** The device players' key rings, by player key, oldest first: every version, so that the history stays readable. */
  keys: Record<string, StoredKeyPair[]>;
  /** The community players' key versions past the first, by player key (`rotateKeys`). */
  rotations: Record<string, number>;
  keyChanges: KeyChange[];
  /** A guild conversation's epochs, oldest first. */
  epochs: Record<ConversationId, EpochRecord[]>;
  /** Each sender's count of messages in a conversation, by `conversation|player`: an envelope's counter. */
  counters: Record<string, number>;
}

/** The chat as version 1 stored it: the messages' texts in clear. Sealed in place on load (`settleChat`). */
export interface StoredChatV1 extends Omit<StoredChat, "version" | "messages" | "reports" | "keys" | "rotations" | "keyChanges" | "epochs" | "counters"> {
  version: 1;
  messages: Record<ConversationId, { id: string; author: string; text: string; at: number; deleted: boolean }[]>;
  reports: { reporter: string; conversation: ConversationId; message: string; author: string; text: string; reason: ChatReportReason; at: number }[];
}

/** A stored chat of either version. */
export type AnyStoredChat = StoredChat | StoredChatV1;

/** A membership that ended: who, in which guild, from when to when (seconds). */
export interface Departure {
  guild: number;
  address: string;
  joinedAt: number;
  leftAt: number;
}

export const freshChat = (): StoredChat => ({
  version: 2,
  nextId: 1,
  messages: {},
  deleted: {},
  sides: {},
  reads: {},
  mutes: [],
  reports: [],
  players: {},
  keys: {},
  rotations: {},
  keyChanges: [],
  epochs: {},
  counters: {},
});

/** A stored chat of version 1 or 2, or null when it is neither (then a fresh one serves). */
export function parseChat(stored: unknown): AnyStoredChat | null {
  const c = stored as AnyStoredChat | null | undefined;
  return c && (c.version === 1 || c.version === 2) && typeof c.messages === "object" && c.messages !== null && Array.isArray(c.mutes) ? c : null;
}

/** What the chat reads of the rest of the mock at `now`: anyone's profile, the follows' graph, the guilds, the known players. */
export interface ChatWorld {
  now: number;
  people: GuildPeople;
  graph: FollowGraph;
  guilds: GuildWorld;
  /** Whether a player has that ID: a community player or one of the device's. */
  known: (address: string) => boolean;
}

const key = playerKey;
const sideKey = (conversation: ConversationId, player: string) => `${conversation}|${key(player)}`;
const NO_SIDE: PrivateSide = { accepted: false, declined: false };
const refuse = (reason: ChatWriteRefusal, retryAt: number | null = null): never => {
  throw new ChatRefusedError(reason, retryAt);
};
const isCommunity = (address: string): boolean => communityMember(address) !== null;

// --- Keys, the directory, the epochs (#997) --------------------------------------------------------------------------

/** Bounds on the caches below, for a page left open for days. */
const CACHE_MAX = 5_000;
const cached = <T>(map: Map<string, T>, k: string, make: () => T): T => {
  if (map.has(k)) return map.get(k)!;
  if (map.size > CACHE_MAX) map.clear();
  const v = make();
  map.set(k, v);
  return v;
};
const communityPairs = new Map<string, MessagingKeyPair>();
const storedPairs = new Map<string, MessagingKeyPair>();
const conversationKeys = new Map<string, Uint8Array | null>();
const epochKeys = new Map<string, Uint8Array | null>();

/** A community player's key pair of `version`, derived from their ID: every device agrees, as the mock plays their part. */
const communityPair = (player: string, version: number): MessagingKeyPair =>
  cached(communityPairs, `${player}|${version}`, () => labelledKeyPair(`paved-mock-community|${player}`, version));

const storedPair = (s: StoredKeyPair): MessagingKeyPair =>
  cached(storedPairs, s.secretKey, () => ({ version: s.version, secretKey: hexToBytes(s.secretKey), publicKey: hexToBytes(s.publicKey) }));

/** Every key pair of `player` the mock holds, oldest first: a device player's ring, or a community player's versions. */
function ringOf(chat: StoredChat, w: ChatWorld, player: string): MessagingKeyPair[] {
  const k = key(player);
  if (isCommunity(k)) return Array.from({ length: chat.rotations[k] ?? 1 }, (_, i) => communityPair(k, i + 1));
  return (chat.keys[k] ?? []).map(storedPair);
}

const pairAt = (chat: StoredChat, w: ChatWorld, player: string, version: number): MessagingKeyPair | null => ringOf(chat, w, player).find((p) => p.version === version) ?? null;

/** The directory: a player's latest public key and its version, or null (a device player the chat has not met yet). */
export function directoryOf(chat: StoredChat, w: ChatWorld, player: string): PublicMessagingKey | null {
  const latest = ringOf(chat, w, player).at(-1);
  return latest ? publicOf(latest) : null;
}

/** Makes a device player's key the first time the chat meets them (their first connect, on the mock's device); true if made. */
function ensureKey(chat: StoredChat, w: ChatWorld, player: string): boolean {
  const k = key(player);
  if (isCommunity(k) || (chat.keys[k]?.length ?? 0) > 0) return false;
  const pair = newKeyPair(1);
  chat.keys[k] = [{ version: 1, secretKey: bytesToHex(pair.secretKey), publicKey: bytesToHex(pair.publicKey), at: w.now }];
  return true;
}

/** A private conversation's key as `viewer` derives it for both versions of a header, or null: a version they do not hold. */
function privateKeyFor(chat: StoredChat, w: ChatWorld, id: ConversationId, viewer: string, versions: readonly [number, number]): Uint8Array | null {
  const c = parseConversation(id);
  const me = key(viewer);
  if (c?.kind !== "private" || !c.players.includes(me)) return null;
  const mineAt = c.players[0] === me ? 0 : 1;
  const mine = pairAt(chat, w, me, versions[mineAt]!);
  const theirs = pairAt(chat, w, c.players[1 - mineAt]!, versions[1 - mineAt]!);
  if (!mine || !theirs) return null;
  return cached(conversationKeys, `${id}|${me}|${bytesToHex(mine.publicKey)}|${bytesToHex(theirs.publicKey)}`, () => {
    try {
      return conversationKey(id, me, mine, publicOf(theirs));
    } catch {
      return null;
    }
  });
}

/** An epoch's key as `viewer` opens it with their ring, or null: the epoch does not cover them. */
function epochKeyFor(chat: StoredChat, w: ChatWorld, record: EpochRecord, viewer: string): Uint8Array | null {
  const wrap = record.wraps[key(viewer)];
  const mine = wrap && pairAt(chat, w, viewer, wrap.version);
  if (!wrap || !mine) return null;
  // Cached by the reader's key pair as well as the wrap: a key the device no longer holds opens nothing, warm or cold.
  return cached(epochKeys, `${record.conversation}|${record.epoch}|${key(viewer)}|${wrap.ephemeral}|${bytesToHex(mine.publicKey)}`, () => openEpoch(record, viewer, [mine]));
}

/** The members of a guild as its epoch covers them, each with their latest key (a device member's made if need be). */
function epochMembers(chat: StoredChat, w: ChatWorld, g: StoredGuild): EpochMember[] {
  return g.members.map((m) => {
    ensureKey(chat, w, m.address);
    return { player: m.address, key: directoryOf(chat, w, m.address)! };
  });
}

/** A player's latest public key, theirs made first if they are a device player the chat has not met yet. */
function keyFor(chat: StoredChat, w: ChatWorld, player: string): PublicMessagingKey {
  ensureKey(chat, w, player);
  return directoryOf(chat, w, player)!;
}

/**
 * Starts a guild's next epochs (#997, point 4), for every guild with a member on this device: one at each change of its
 * members since its latest epoch (a joining, a kick, a leave: each one's time, from the roster, the recorded departures and
 * the log, so that a leave and a rejoin between two reads are two epochs, not none), then one more if its members as they
 * stand, or one of their keys, differ from the latest. The joiner makes it at a joining, else the highest rank (the officer of
 * a kick, the first remaining member of a leave). The mock makes it at once, dated at the change. True if anything was made.
 * The ledger also runs it after each guild write (`settleChat`), so that each write's change is an epoch of its own.
 */
function settleEpochs(chat: StoredChat, w: ChatWorld): boolean {
  let changed = false;
  for (const g of w.guilds.guilds) {
    if (g.members.length === 0 || g.members.every((m) => isCommunity(m.address))) continue;
    const id = guildConversation(g.id);
    // A device member's key made here is a change to store, whether or not an epoch follows.
    if (g.members.map((m) => ensureKey(chat, w, m.address)).some(Boolean)) changed = true;
    const rank = new Map(g.members.map((m) => [m.address, m.rank] as const));
    const start = (at: number, roster: readonly string[], joiners: readonly string[]) => {
      const list = chat.epochs[id] ?? [];
      const latest = list.at(-1) ?? null;
      const covered = new Set(latest?.members ?? []);
      const joiner = latest ? joiners.find((p) => !covered.has(p)) : undefined;
      const creator = joiner ?? [...roster].sort((a, b) => (rank.get(b) ?? -1) - (rank.get(a) ?? -1) || (a < b ? -1 : 1))[0]!;
      const members = roster.map((p) => ({ player: p, key: keyFor(chat, w, p) }));
      chat.epochs[id] = [...list, makeEpoch({ conversation: id, epoch: (latest?.epoch ?? 0) + 1, creator, at, members }).record];
      changed = true;
    };
    // Each change of the roster since the latest epoch, in order.
    const since = chat.epochs[id]?.at(-1)?.at;
    if (since !== undefined) {
      const spans = allMemberships(g, chat.departed ?? []);
      const times = [...new Set(spans.flatMap((m) => [m.from, m.to]))].filter((t) => Number.isFinite(t) && t > since && t <= w.now).sort((a, b) => a - b);
      for (const t of times) {
        const roster = [...new Set(spans.filter((m) => m.from <= t && t < m.to).map((m) => m.address))].sort();
        const latest = chat.epochs[id]!.at(-1)!;
        const now = roster.map((p) => ({ player: p, key: keyFor(chat, w, p) }));
        if (roster.length > 0 && epochDue(latest, now)) start(t, roster, spans.filter((m) => m.from === t).map((m) => m.address));
      }
    }
    // The members as they stand.
    const latest = chat.epochs[id]?.at(-1) ?? null;
    const members = epochMembers(chat, w, g);
    if (!epochDue(latest, members)) continue;
    const inGuild = new Set(g.members.map((m) => m.address));
    const changes = [
      ...g.members.map((m) => m.joinedAt),
      ...(chat.departed ?? []).filter((d) => d.guild === g.id).map((d) => d.leftAt),
      ...chat.keyChanges.filter((k) => inGuild.has(k.player)).map((k) => k.at),
    ];
    const at = Math.min(w.now, Math.max(latest?.at ?? g.createdAt, ...changes));
    start(at, [...inGuild].sort(), [...g.members].sort((a, b) => b.joinedAt - a.joinedAt).map((m) => m.address));
  }
  return changed;
}

/** The key an epoch seals with, as the mock opens it for anyone it covers (the mock plays every member's part), or null. */
function epochKeyOfAny(chat: StoredChat, w: ChatWorld, record: EpochRecord): Uint8Array | null {
  for (const member of record.members) {
    const k = epochKeyFor(chat, w, record, member);
    if (k) return k;
  }
  return null;
}

/**
 * Seals a message of `sender` in a guild's or private conversation (#997): with the conversation's key from the sender's latest
 * key and the other's in the directory, or with the guild's latest epoch; the header carries the sender's next counter.
 */
function sealIn(chat: StoredChat, w: ChatWorld, id: ConversationId, c: Conversation, sender: string, text: string, at: number): Envelope {
  const counterKey = sideKey(id, sender);
  const counter = (chat.counters[counterKey] ?? 0) + 1;
  chat.counters[counterKey] = counter;
  if (c.kind === "private") {
    const other = otherPlayer(id, sender)!;
    ensureKey(chat, w, sender);
    ensureKey(chat, w, other);
    const versions = privateVersions(id, sender, directoryOf(chat, w, sender)!.version, directoryOf(chat, w, other)!.version);
    const k = privateKeyFor(chat, w, id, sender, versions);
    if (!k) throw new Error("mock chat: no conversation key");
    return seal(k, { conversation: id, sender: key(sender), versions, at, counter }, text);
  }
  const latest = chat.epochs[id]?.at(-1);
  const epochKey = latest && (epochKeyFor(chat, w, latest, sender) ?? epochKeyOfAny(chat, w, latest));
  if (!latest || !epochKey) throw new Error("mock chat: no epoch to seal with");
  return seal(guildMessageKey(epochKey, id, latest.epoch), { conversation: id, sender: key(sender), epoch: latest.epoch, at, counter }, text);
}

/** Opens a sealed message of `author` in `id` with `viewer`'s keys, or null: a key they do not hold, or a mismatch. */
function openFor(chat: StoredChat, w: ChatWorld, id: ConversationId, c: Conversation, viewer: string, author: string, at: number, sealed: Envelope) {
  const h = sealed.header;
  if (h.conversation !== id || key(h.sender) !== key(author) || h.at !== at) return null;
  let k: Uint8Array | null = null;
  if (c.kind === "private" && "versions" in h) k = privateKeyFor(chat, w, id, viewer, h.versions);
  if (c.kind === "guild" && "epoch" in h) {
    const record = chat.epochs[id]?.find((e) => e.epoch === h.epoch);
    const epochKey = record ? epochKeyFor(chat, w, record, viewer) : null;
    k = epochKey ? guildMessageKey(epochKey, id, h.epoch) : null;
  }
  return k ? open(k, sealed) : null;
}

/** Version 1's chat, sealed in place (#997, point 5): its keys made, its guilds' first epochs, its texts sealed, its reports kept. */
function upgradeChat(old: StoredChatV1, w: ChatWorld): StoredChat {
  const { messages, reports, ...rest } = structuredClone(old);
  const next: StoredChat = { ...rest, version: 2, messages: {}, reports: [], keys: {}, rotations: {}, keyChanges: [], epochs: {}, counters: {} };
  settleEpochs(next, w);
  for (const [id, list] of Object.entries(messages)) {
    const c = parseConversation(id);
    if (!c) continue;
    if (c.kind === "world") {
      next.messages[id] = list;
      continue;
    }
    if (c.kind === "guild" && !next.epochs[id]?.length) {
      // A guild with no member on this device, or none left: no one here reads it, so its texts are not kept.
      const g = w.guilds.guilds.find((x) => x.id === c.guild);
      if (!g || g.members.length === 0) continue;
      next.epochs[id] = [makeEpoch({ conversation: id, epoch: 1, creator: g.members[0]!.address, at: w.now, members: epochMembers(next, w, g) }).record];
    }
    next.messages[id] = list.map((m) => ({ id: m.id, author: m.author, at: m.at, deleted: m.deleted, sealed: sealIn(next, w, id, c, m.author, m.deleted ? "" : m.text, m.at) }));
  }
  next.reports = reports.map(({ text, ...r }) => ({ ...r, revealed: [{ id: r.message, author: r.author, at: r.at, text, frankingKey: null, commitment: null, checked: null }] }));
  return next;
}

// --- Draws -----------------------------------------------------------------------------------------------------------

/** One Poseidon, cut into four draws in [0, 1). */
function draws(kind: bigint, a: bigint, b: bigint): [number, number, number, number] {
  let h = poseidon(kind, a, b);
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    out.push(Number(h % 1_000_000n) / 1_000_000);
    h /= 1_000_000n;
  }
  return out as [number, number, number, number];
}

const drawn = new Map<string, readonly [number, number, number, number]>();
function cachedDraws(kind: bigint, a: bigint, b: bigint): readonly [number, number, number, number] {
  const k = `${kind}:${a}:${b}`;
  let d = drawn.get(k);
  if (!d) {
    // A bound on the memory, for a page left open for days.
    if (drawn.size > 50_000) drawn.clear();
    drawn.set(k, (d = draws(kind, a, b)));
  }
  return d;
}

const pick = <T>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))]!;

let worldSpeakers: readonly string[] | null = null;
/** The community players who may write in the World: level 2 and up (game-core's rule holds for them too). */
const speakers = (): readonly string[] => (worldSpeakers ??= community().filter((m) => m.level >= CHAT_WORLD_MIN_LEVEL).map((m) => key(m.address)));

/** The World's drawn line of a minute's slot, or null. */
function worldLine(slot: number): StoredChatMessage | null {
  const [chance, second, who, line] = cachedDraws(WORLD_DRAW, BigInt(slot), 0n);
  if (chance >= WORLD_CHANCE) return null;
  return { id: `w${slot}`, author: pick(speakers(), who), text: filterWords(pick(WORLD_LINES, line), CHAT_FILTER_WORDS), at: slot * WORLD_SLOT_S + Math.floor(second * WORLD_SLOT_S), deleted: false };
}

/**
 * The memberships a guild's log shows ended, for those no departure records (a world stored before the departures were): each
 * leave or kick whose join (or the guild's creation by them) is still in the log. One whose join left the bounded log
 * (`GUILD_LOG_KEPT`) is not guessed: a guessed start would make them a speaker of lines that were never theirs.
 */
function logDepartures(g: StoredGuild, recorded: readonly Departure[]): { address: string; from: number; to: number }[] {
  const joined = new Map<string, number>();
  const out: { address: string; from: number; to: number }[] = [];
  for (const e of g.log) {
    if (e.kind === "joined" || e.kind === "created") joined.set(e.actor, e.at);
    const gone = e.kind === "left" ? e.actor : e.kind === "kicked" ? e.target : null;
    if (gone === null) continue;
    const from = joined.get(gone);
    joined.delete(gone);
    if (from === undefined || recorded.some((d) => d.address === gone && d.leftAt === e.at)) continue;
    out.push({ address: gone, from, to: e.at });
  }
  return out;
}

/** A guild's community memberships, past and present: who, from when, until when (Infinity: still a member). */
type Memberships = readonly { address: string; from: number; to: number }[];

/** A guild's memberships, past and present, the device's players' included. */
function allMemberships(g: StoredGuild, departed: readonly Departure[]): Memberships {
  const recorded = departed.filter((d) => d.guild === g.id);
  return [...g.members.map((m) => ({ address: m.address, from: m.joinedAt, to: Infinity })), ...recorded.map((d) => ({ address: d.address, from: d.joinedAt, to: d.leftAt })), ...logDepartures(g, recorded)];
}

const membershipsOf = (g: StoredGuild, departed: readonly Departure[]): Memberships => allMemberships(g, departed).filter((m) => isCommunity(m.address));

/** The community members of a guild at `at`, by address: those of that time, whoever joined or left since. */
const guildSpeakers = (memberships: Memberships, at: number): string[] => [...new Set(memberships.filter((m) => m.from <= at && at < m.to).map((m) => m.address))].sort();

/** A guild's drawn line of a slot, or null (no community member then, or no line). */
function guildLine(g: StoredGuild, memberships: Memberships, slot: number): StoredChatMessage | null {
  const [chance, second, who, line] = cachedDraws(GUILD_DRAW, BigInt(g.id), BigInt(slot));
  if (chance >= GUILD_CHANCE) return null;
  const at = slot * GUILD_SLOT_S + Math.floor(second * GUILD_SLOT_S);
  const members = guildSpeakers(memberships, at);
  if (members.length === 0 || at < g.createdAt) return null;
  return { id: `g${slot}`, author: pick(members, who), text: filterWords(pick(GUILD_LINES, line), CHAT_FILTER_WORDS), at, deleted: false };
}

/**
 * The `count` latest lines drawn at or before `to`, and none before `from`, oldest first: walked back slot by slot, so that what
 * a conversation keeps is its last lines by count (`CHAT_KEPT`), never by age.
 */
function drawnBack(slotS: number, from: number, to: number, count: number, line: (slot: number) => StoredChatMessage | null): StoredChatMessage[] {
  const out: StoredChatMessage[] = [];
  for (let slot = Math.floor(to / slotS); slot >= Math.floor(from / slotS) && out.length < count; slot--) {
    const m = line(slot);
    if (m && m.at >= from && m.at <= to) out.push(m);
  }
  return out.reverse();
}

/** The time of the next drawn line after `now`, or null within `AHEAD_SLOTS`. */
function nextDrawn(slotS: number, now: number, line: (slot: number) => StoredChatMessage | null): number | null {
  const first = Math.floor(now / slotS);
  for (let slot = first; slot < first + AHEAD_SLOTS; slot++) {
    const m = line(slot);
    if (m && m.at > now) return m.at;
  }
  return null;
}

// --- The world as the chat reads it ----------------------------------------------------------------------------------

const guildOfKey = (world: GuildWorld, address: string): StoredGuild | null => world.guilds.find((g) => g.members.some((m) => m.address === key(address))) ?? null;
const rankIn = (g: StoredGuild | null, address: string): GuildRank | null => g?.members.find((m) => m.address === key(address))?.rank ?? null;

/** Whether two players are friends (#954) or guildmates (#953): their private conversation is open. */
function related(w: ChatWorld, a: string, b: string): boolean {
  if (areFriends(w.graph, a, b)) return true;
  const g = guildOfKey(w.guilds, a);
  return g !== null && rankIn(g, b) !== null;
}

/** A private conversation as `player` sees it with `other`. */
function pairOf(chat: StoredChat, w: ChatWorld, id: ConversationId, player: string, other: string): PrivatePair {
  return {
    related: related(w, player, other),
    mine: chat.sides[sideKey(id, player)] ?? NO_SIDE,
    theirs: chat.sides[sideKey(id, other)] ?? NO_SIDE,
    theyWrote: (chat.messages[id] ?? []).some((m) => m.author === key(other)),
    block: blockBetween(w.graph, player, other),
  };
}

/**
 * A line of a conversation: a message, or a guild's event. Before a viewer, a sealed message has no text; opened for one
 * (`openLine`), it has its text (filtered), its franking key, or `unreadable`.
 */
interface Line {
  id: string;
  author: string;
  at: number;
  deleted: boolean;
  text: string;
  sealed: Envelope | null;
  /** Opened for the viewer: the text as sealed (before the filter) and its franking key. */
  opened: { text: string; frankingKey: string } | null;
  /** The viewer's keys do not open it, or its commitment does not match (#997, point 6). */
  unreadable: boolean;
  event: StoredLogEntry | null;
}

const asLine = (m: StoredChatMessage): Line => ({ id: m.id, author: m.author, at: m.at, deleted: m.deleted, text: m.text ?? "", sealed: m.sealed ?? null, opened: null, unreadable: false, event: null });

/** Every line a conversation keeps at `w.now` (`CHAT_KEPT`), oldest first, before any viewer's filter. */
function linesOf(chat: StoredChat, w: ChatWorld, id: ConversationId, c: Conversation): Line[] {
  const stored = (chat.messages[id] ?? []).map(asLine);
  if (c.kind === "private") return stored;
  const gone = new Set(chat.deleted[id] ?? []);
  const mark = (m: StoredChatMessage): Line => ({ ...asLine(m), deleted: m.deleted || gone.has(m.id) });
  let lines: Line[];
  if (c.kind === "world") {
    lines = [...drawnBack(WORLD_SLOT_S, w.now - WORLD_LOOKBACK_S, w.now, CHAT_KEPT.world, worldLine).map(mark), ...stored];
  } else {
    const g = w.guilds.guilds.find((x) => x.id === c.guild);
    if (!g) return [];
    const memberships = membershipsOf(g, chat.departed ?? []);
    // No line before the guild, nor before its first community member.
    const from = Math.max(g.createdAt, Math.min(...memberships.map((m) => m.from)));
    const events: Line[] = g.log
      .filter((e) => EVENT_KINDS.has(e.kind) && e.at >= g.createdAt && e.at <= w.now)
      .map((e): Line => ({ id: `e${e.at}-${e.kind}-${e.actor}-${e.target ?? ""}`, author: e.actor, text: "", at: e.at, deleted: false, sealed: null, opened: null, unreadable: false, event: e }));
    const drawnLines = Number.isFinite(from) ? drawnBack(GUILD_SLOT_S, from, w.now, CHAT_KEPT.guild, (slot) => guildLine(g, memberships, slot)) : [];
    lines = [...drawnLines.map(mark), ...events, ...stored];
  }
  return keepMessages(c.kind, lines.filter((l) => l.at <= w.now).sort(compareMessages));
}

/** Whether `viewer` sees a line: an event always, else not a blocked author anywhere, nor a muted one outside private. */
const shows = (chat: StoredChat, w: ChatWorld, kind: ChatKind, viewer: string, l: Line): boolean =>
  l.event !== null || !hiddenFrom(kind, viewer, l.author, { blocking: isBlocking(w.graph, viewer, l.author), muted: isMuted(chat.mutes, viewer, l.author) });

/** The conversation of an ID that `player` may read, and its guild, or null. */
function readable(w: ChatWorld, id: ConversationId, player: string): { c: Conversation; guild: StoredGuild | null; other: string | null } | null {
  const c = parseConversation(id);
  if (!c) return null;
  const guild = guildOfKey(w.guilds, player);
  if (c.kind === "guild") return guild?.id === c.guild ? { c, guild, other: null } : null;
  if (c.kind === "private") {
    const other = otherPlayer(id, player);
    return other !== null && w.known(other) ? { c, guild, other } : null;
  }
  return { c, guild, other: null };
}

// --- Settling what the community does --------------------------------------------------------------------------------

/** When the community player of a private conversation answers its last message (by a device player), or null. */
function replyDue(chat: StoredChat, w: ChatWorld, id: ConversationId): { member: string; message: StoredChatMessage } | null {
  const c = parseConversation(id);
  if (c?.kind !== "private") return null;
  const [a, b] = c.players;
  const member = isCommunity(a) ? a : isCommunity(b) ? b : null;
  if (member === null || (isCommunity(a) && isCommunity(b))) return null;
  const list = chat.messages[id] ?? [];
  const last = list[list.length - 1];
  if (!last || last.author === member) return null;
  if (blockBetween(w.graph, member, last.author)) return null;
  const n = BigInt(Number.parseInt(last.id.replace(/\D/g, ""), 10) || 0);
  const [delay, line] = cachedDraws(REPLY_DRAW, BigInt(member), n);
  const at = last.at + MOCK_REPLY_MIN_S + Math.floor(delay * MOCK_REPLY_SPREAD_S);
  return { member, message: { id: `r${last.id}`, author: member, text: pick(REPLY_LINES, line), at, deleted: false } };
}

/** The stranger who sends the mock's request to `player`, and the message, or null (none left). */
function requestDue(chat: StoredChat, w: ChatWorld, player: string): { id: ConversationId; member: string; message: StoredChatMessage } | null {
  const p = chat.players[key(player)];
  if (!p?.firstVisit || p.requested) return null;
  let seed: bigint;
  try {
    seed = BigInt(player);
  } catch {
    return null;
  }
  const members = community();
  const [start, line] = cachedDraws(REQUEST_DRAW, seed, 0n);
  const first = Math.floor(start * members.length);
  for (let i = 0; i < members.length; i++) {
    const member = key(members[(first + i) % members.length]!.address);
    const id = privateConversation(player, member);
    if (related(w, player, member) || blockBetween(w.graph, player, member) || (chat.messages[id]?.length ?? 0) > 0) continue;
    return { id, member, message: { id: `q${key(player)}`, author: member, text: pick(REQUEST_LINES, line), at: p.firstVisit + MOCK_REQUEST_S, deleted: false } };
  }
  return null;
}

/** A community player's message the mock made, sealed as they would seal it (#997: the answers and requests are stored). */
function sealedBy(chat: StoredChat, w: ChatWorld, id: ConversationId, m: StoredChatMessage): StoredChatMessage {
  const c = parseConversation(id)!;
  return { id: m.id, author: m.author, at: m.at, deleted: m.deleted, sealed: sealIn(chat, w, id, c, m.author, m.text ?? "", m.at) };
}

/**
 * The stored chat at `w.now`, a version 1 sealed in place, with what is due made: the reader's key (`player`, their first
 * connect on this device), the guilds' epochs, the community's answers in private and the strangers' requests, sealed. A new
 * value, and whether it differs from what is stored (then the reader stores it: keys and epochs must not be made twice).
 */
export function settleChat(chat: AnyStoredChat, w: ChatWorld, player: string | null = null): { chat: StoredChat; changed: boolean } {
  let changed = chat.version === 1;
  const next: StoredChat = chat.version === 1 ? upgradeChat(chat, w) : structuredClone(chat);
  if (player !== null && ensureKey(next, w, player)) changed = true;
  if (settleEpochs(next, w)) changed = true;
  for (const id of Object.keys(next.messages)) {
    const due = replyDue(next, w, id);
    if (!due || due.message.at > w.now) continue;
    next.messages[id] = [...next.messages[id]!, sealedBy(next, w, id, due.message)];
    next.sides[sideKey(id, due.member)] = { accepted: true, declined: false };
    changed = true;
  }
  for (const p of Object.keys(next.players)) {
    const seen = next.players[p]!;
    if (!seen.firstVisit || seen.requested || seen.firstVisit + MOCK_REQUEST_S > w.now) continue;
    const due = requestDue(next, w, p);
    seen.requested = true;
    changed = true;
    if (!due) continue;
    next.messages[due.id] = [...(next.messages[due.id] ?? []), sealedBy(next, w, due.id, due.message)];
    next.sides[sideKey(due.id, due.member)] = { accepted: true, declined: false };
  }
  return { chat: next, changed };
}

/**
 * When something next comes by itself to `player` in `id` (null: in any of their conversations), in seconds: the next drawn
 * line, an answer or the request due. Null: nothing within the look ahead. The subscribers wake then.
 */
export function nextDue(chat: StoredChat, w: ChatWorld, player: string, id: ConversationId | null): number | null {
  const times: number[] = [];
  const guild = guildOfKey(w.guilds, player);
  if (id === null || id === WORLD_CONVERSATION) times.push(nextDrawn(WORLD_SLOT_S, w.now, worldLine) ?? Infinity);
  if (guild && (id === null || id === guildConversation(guild.id))) times.push(nextDrawn(GUILD_SLOT_S, w.now, (slot) => guildLine(guild, membershipsOf(guild, chat.departed ?? []), slot)) ?? Infinity);
  for (const conversation of Object.keys(chat.messages)) {
    if ((id !== null && conversation !== id) || otherPlayer(conversation, player) === null) continue;
    const due = replyDue(chat, w, conversation);
    if (due && due.message.at > w.now) times.push(due.message.at);
  }
  const p = chat.players[key(player)];
  if (p?.firstVisit && !p.requested && p.firstVisit + MOCK_REQUEST_S > w.now) {
    const due = requestDue(chat, w, player);
    if (due && (id === null || id === due.id)) times.push(due.message.at);
  }
  const next = Math.min(...times);
  return Number.isFinite(next) ? next : null;
}

// --- Views -----------------------------------------------------------------------------------------------------------

const logEntryOf = (w: ChatWorld, e: StoredLogEntry): GuildLogEntry => ({
  kind: e.kind,
  at: e.at,
  actor: e.actor,
  actorName: w.people(e.actor).name,
  target: e.target,
  targetName: e.target === null ? null : w.people(e.target).name,
  reason: e.reason,
});

/** A line as `viewer` sees it. */
function viewOf(chat: StoredChat, w: ChatWorld, id: ConversationId, kind: ChatKind, viewer: string, l: Line, guild: StoredGuild | null): ChatMessage {
  if (l.event) return { id: l.id, conversation: id, kind: "event", author: null, text: "", at: l.at, deleted: false, unreadable: false, event: logEntryOf(w, l.event), mine: false, mayDelete: false, mayReport: false };
  const profile = w.people(l.author);
  const authorGuild = guildOfKey(w.guilds, l.author);
  const mine = key(l.author) === key(viewer);
  const ranks = kind === "guild" ? { rank: rankIn(guild, viewer), authorRank: rankIn(guild, l.author) } : {};
  const reported = chat.reports.some((r) => r.reporter === key(viewer) && r.conversation === id && r.message === l.id);
  return {
    id: l.id,
    conversation: id,
    kind: "message",
    author: { address: profile.address, name: profile.name, look: profile.look, level: profile.level, guildTag: authorGuild ? guildTag(authorGuild.id) : null },
    text: l.deleted || l.unreadable ? "" : l.text,
    at: l.at,
    deleted: l.deleted,
    unreadable: !l.deleted && l.unreadable,
    event: null,
    mine,
    mayDelete: deleteRefusal(kind, { address: viewer, ...ranks }, l) === null,
    mayReport: !l.unreadable && reportRefusal(viewer, l, "spam", reported) === null,
  };
}

/**
 * A line opened for `viewer`: a sealed message's text (filtered after opening, #997, point 6), or unreadable: a key they do
 * not hold, a mismatch, or a replay (`replayed`: its sender's counter repeats or goes back).
 */
function openLine(chat: StoredChat, w: ChatWorld, id: ConversationId, c: Conversation, viewer: string, l: Line, replayed: ReadonlySet<string>): Line {
  if (!l.sealed || l.deleted) return l;
  if (replayed.has(l.id)) return { ...l, text: "", opened: null, unreadable: true };
  const opened = openFor(chat, w, id, c, viewer, l.author, l.at, l.sealed);
  return opened ? { ...l, text: filterWords(opened.text, CHAT_FILTER_WORDS), opened, unreadable: false } : { ...l, text: "", opened: null, unreadable: true };
}

/**
 * The lines of a conversation that `viewer` may read, opened, oldest first: in a guild's, its messages from their joining on
 * (a joiner reads from there, #997's open point 2; the log's events stay).
 */
function readableLines(chat: StoredChat, w: ChatWorld, id: ConversationId, c: Conversation, viewer: string, guild: StoredGuild | null): Line[] {
  const since = c.kind === "guild" ? (guild?.members.find((m) => m.address === key(viewer))?.joinedAt ?? Infinity) : -Infinity;
  const lines = linesOf(chat, w, id, c);
  // The counters are read over every sealed line kept, in order, before the joiner's cut.
  const sealed = lines.filter((l) => l.sealed !== null);
  const flags = replayedEnvelopes(sealed.map((l) => l.sealed!.header));
  const replayed = new Set(sealed.filter((_, i) => flags[i]).map((l) => l.id));
  return lines.filter((l) => l.event !== null || l.at >= since).map((l) => openLine(chat, w, id, c, viewer, l, replayed));
}

/** The lines of a conversation `viewer` sees, as they see them, oldest first. */
function visibleOf(chat: StoredChat, w: ChatWorld, id: ConversationId, c: Conversation, viewer: string, guild: StoredGuild | null): ChatMessage[] {
  return readableLines(chat, w, id, c, viewer, guild)
    .filter((l) => shows(chat, w, c.kind, viewer, l))
    .map((l) => viewOf(chat, w, id, c.kind, viewer, l, guild));
}

const unreadOf = (messages: readonly ChatMessage[], viewer: string, readAt: number): number =>
  unreadMessages(
    messages.map((m) => ({ at: m.at, author: m.author?.address ?? null, deleted: m.deleted })),
    viewer,
    readAt,
  );

/** When `viewer` last read a conversation; a guild's, by default, when they joined (nothing from before is unread). */
function readAtOf(chat: StoredChat, id: ConversationId, viewer: string, guild: StoredGuild | null): number {
  const read = chat.reads[sideKey(id, viewer)];
  if (read !== undefined) return read;
  return guild?.members.find((m) => m.address === key(viewer))?.joinedAt ?? 0;
}

/** A conversation's last message, else its last event, else null. */
function lastOf(messages: readonly ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.kind === "message") return messages[i]!;
  return messages[messages.length - 1] ?? null;
}

function summaryOf(chat: StoredChat, w: ChatWorld, id: ConversationId, c: Conversation, viewer: string, guild: StoredGuild | null, messages: readonly ChatMessage[]): ConversationSummary {
  const other = c.kind === "private" ? otherPlayer(id, viewer) : null;
  const g = c.kind === "guild" ? guild : null;
  return {
    id,
    kind: c.kind,
    guild: g ? { id: g.id, tag: guildTag(g.id), name: g.name, emblem: { ...g.settings.emblem }, rank: rankIn(g, viewer) ?? GUILD_RANK.member } : null,
    other: other === null ? null : w.people(other),
    last: lastOf(messages),
    unread: unreadOf(messages, viewer, readAtOf(chat, id, viewer, g)),
  };
}

/** The Chat tab of `player`. */
export function overviewOf(chat: StoredChat, w: ChatWorld, player: string): ChatOverview {
  const guild = guildOfKey(w.guilds, player);
  const listed: ConversationSummary[] = [];
  const requests: ConversationSummary[] = [];
  const add = (id: ConversationId) => {
    const r = readable(w, id, player)!;
    listed.push(summaryOf(chat, w, id, r.c, player, guild, visibleOf(chat, w, id, r.c, player, guild)));
  };
  add(WORLD_CONVERSATION);
  if (guild) add(guildConversation(guild.id));
  const privateUnread: number[] = [];
  for (const id of Object.keys(chat.messages)) {
    const r = readable(w, id, player);
    if (r?.c.kind !== "private" || r.other === null || isBlocking(w.graph, player, r.other)) continue;
    const standing = privateStanding(pairOf(chat, w, id, player, r.other));
    if (standing !== "open" && standing !== "request") continue;
    const summary = summaryOf(chat, w, id, r.c, player, guild, visibleOf(chat, w, id, r.c, player, guild));
    if (summary.last === null) continue;
    if (standing === "request") requests.push(summary);
    else {
      listed.push(summary);
      privateUnread.push(summary.unread);
    }
  }
  const conversations = sortConversations(listed.map((s) => ({ ...s, lastAt: s.last?.at ?? null }))).map(({ lastAt: _, ...s }) => s);
  requests.sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0));
  const guildUnread = guild ? (listed.find((s) => s.kind === "guild")?.unread ?? 0) : 0;
  return { conversations, requests, badge: chatBadge({ guild: guildUnread, private: privateUnread, requests: requests.length }), noticeSeen: chat.players[key(player)]?.noticeSeen === true };
}

/** A conversation's cursor: a message's time and ID. */
const cursorOf = (c: { at: number; id: string } | null): string | null => (c === null ? null : `${c.at}:${c.id}`);
function parseCursor(cursor: string | null | undefined): { at: number; id: string } | null {
  if (!cursor) return null;
  const at = /^(\d+):(.+)$/.exec(cursor);
  return at ? { at: Number(at[1]), id: at[2]! } : null;
}

/** The player's own messages in a conversation, as the rate limits read them. */
const sentBy = (chat: StoredChat, id: ConversationId, player: string) => (chat.messages[id] ?? []).filter((m) => m.author === key(player)).map((m) => ({ at: m.at, text: m.text ?? "" }));

/** Why the player may not write in a conversation at all (not the rate limits), or null. */
function writeRefusalOf(chat: StoredChat, w: ChatWorld, id: ConversationId, r: NonNullable<ReturnType<typeof readable>>, player: string): ChatRefusal | null {
  if (r.c.kind === "world") return w.people(player).level < CHAT_WORLD_MIN_LEVEL ? "level-low" : null;
  if (r.c.kind === "guild") return null;
  return privateRefusal(pairOf(chat, w, id, player, r.other!));
}

/** What a conversation's encryption says to `viewer` (#997): public, the guild's, or private with its safety code and key changes. */
function encryptionOf(chat: StoredChat, w: ChatWorld, id: ConversationId, c: Conversation, viewer: string): ChatEncryption {
  if (c.kind !== "private") return { mode: c.kind === "world" ? "public" : "guild", safetyCode: null, keyChanges: [] };
  const other = otherPlayer(id, viewer)!;
  const mine = directoryOf(chat, w, viewer);
  const theirs = directoryOf(chat, w, other);
  const first = chat.messages[id]?.[0]?.at;
  return {
    mode: "private",
    safetyCode: mine && theirs ? safetyCode(mine.publicKey, theirs.publicKey) : null,
    keyChanges: first === undefined ? [] : chat.keyChanges.filter((k) => k.player === key(other) && k.at >= first).map(({ at, version }) => ({ at, version })),
  };
}

/** A page of a conversation as `player` sees it, or null when they may not read it. */
export function pageOf(chat: StoredChat, w: ChatWorld, player: string, id: ConversationId, before: string | null = null): ChatPage | null {
  const r = readable(w, id, player);
  if (!r) return null;
  const messages = visibleOf(chat, w, id, r.c, player, r.guild);
  const page = chatPage(messages, parseCursor(before), CHAT_PAGE_SIZE);
  const latest = r.c.kind === "guild" ? r.guild!.announcements[0] : undefined;
  const pinned: GuildAnnouncement | null = latest ? { id: latest.id, author: latest.author, authorName: w.people(latest.author).name, text: latest.text, at: latest.at, editedAt: latest.editedAt } : null;
  const pair = r.c.kind === "private" ? pairOf(chat, w, id, player, r.other!) : null;
  return {
    conversation: summaryOf(chat, w, id, r.c, player, r.guild, messages),
    encryption: encryptionOf(chat, w, id, r.c, player),
    messages: page.messages,
    before: cursorOf(page.before),
    pinned,
    standing: pair ? privateStanding(pair) : null,
    awaitsReply: pair !== null && !reachesDirectly(pair),
    writeRefusal: writeRefusalOf(chat, w, id, r, player),
    nextSendAt: nextSendAt(r.c.kind, sentBy(chat, id, player), w.now),
  };
}

/** What a page of a conversation says beside its messages, as `player` sees it, or null when they may not read it. */
export function headOf(chat: StoredChat, w: ChatWorld, player: string, id: ConversationId): ChatPageHead | null {
  const page = pageOf(chat, w, player, id);
  if (!page) return null;
  const { messages: _, before: __, ...head } = page;
  return head;
}

/** The players `player` mutes, the latest first. */
export const mutesOf = (chat: StoredChat, w: ChatWorld, player: string): PublicProfile[] =>
  chat.mutes
    .filter((m) => m.muter === key(player))
    .sort((a, b) => b.at - a.at)
    .map((m) => w.people(m.muted));

/** The new messages `viewer` sees in `id` (null: any of their conversations) after `since`, oldest first: what a subscriber hears. */
export function arrivals(chat: StoredChat, w: ChatWorld, viewer: string, id: ConversationId | null, since: number): ChatMessage[] {
  const ids = id !== null ? [id] : conversationsOf(chat, w, viewer);
  return ids.flatMap((c) => {
    const r = readable(w, c, viewer);
    if (!r) return [];
    if (r.c.kind === "private" && (isBlocking(w.graph, viewer, r.other!) || privateStanding(pairOf(chat, w, c, viewer, r.other!)) === "declined")) return [];
    return visibleOf(chat, w, c, r.c, viewer, r.guild).filter((m) => m.at > since);
  });
}

/** Every conversation of `player`: the World, their guild's, their private ones. */
export function conversationsOf(chat: StoredChat, w: ChatWorld, player: string): ConversationId[] {
  const guild = guildOfKey(w.guilds, player);
  return [WORLD_CONVERSATION, ...(guild ? [guildConversation(guild.id)] : []), ...Object.keys(chat.messages).filter((id) => otherPlayer(id, player) !== null)];
}

/** One message of a conversation as `viewer` sees it (null: not there or hidden from them). */
export function messageView(chat: StoredChat, w: ChatWorld, viewer: string, id: ConversationId, message: string): ChatMessage | null {
  const r = readable(w, id, viewer);
  if (!r) return null;
  return visibleOf(chat, w, id, r.c, viewer, r.guild).find((m) => m.id === message) ?? null;
}

// --- Writes ----------------------------------------------------------------------------------------------------------

/** One chat write, applied in place on a settled copy for `player` at `w.now`; a refusal throws a `ChatRefusedError`. */
export interface ChatWrite {
  chat: StoredChat;
  w: ChatWorld;
  player: string;
}

function readableOrRefuse(w: ChatWorld, id: ConversationId, player: string) {
  const c = parseConversation(id);
  if (!c) return refuse("not-found");
  if (c.kind === "private") {
    const other = otherPlayer(id, player);
    if (other === null) return refuse("not-yours");
    if (!w.known(other)) return refuse("unknown-player");
  }
  const r = readable(w, id, player);
  return r ?? refuse(c.kind === "guild" ? "not-in-guild" : "not-found");
}

/** Sends a message; answers its ID. The text is kept in its normal form, filtered (`filterWords`). */
export function sendIn({ chat, w, player }: ChatWrite, id: ConversationId, text: string): string {
  const r = readableOrRefuse(w, id, player);
  const sent = sentBy(chat, id, player);
  const pair = r.c.kind === "private" ? pairOf(chat, w, id, player, r.other!) : undefined;
  // The text as it is kept (filtered), so that the repeat rule compares it with the kept texts: "darn" twice is "•••" twice.
  // Its length is checked as typed first: the filter never lets a longer text through.
  // A sealed message keeps the text as typed (normal form): its readers filter it after opening (#997, point 6).
  const normal = normalMessage(text);
  const kept = filterWords(normal, CHAT_FILTER_WORDS);
  const refused = messageTextRefusal(text) ?? sendRefusal(r.c, { level: w.people(player).level, guild: r.guild?.id ?? null }, kept, sent, w.now, pair);
  if (refused) refuse(refused, refused === "too-fast" || refused === "per-minute" ? nextSendAt(r.c.kind, sent, w.now) : null);
  const head = { id: `m${chat.nextId++}`, author: key(player), at: w.now, deleted: false };
  const message: StoredChatMessage = r.c.kind === "world" ? { ...head, text: kept } : { ...head, sealed: sealIn(chat, w, id, r.c, player, normal, w.now) };
  chat.messages[id] = keepMessages(r.c.kind, [...(chat.messages[id] ?? []), message]);
  // Writing in private answers a request, and opens the conversation on the player's side.
  if (r.c.kind === "private") chat.sides[sideKey(id, player)] = { accepted: true, declined: false };
  return message.id;
}

/** The line `message` of a conversation the player may read, as anyone sees it (not an event). */
function lineOrRefuse(chat: StoredChat, w: ChatWorld, id: ConversationId, r: { c: Conversation }, message: string): Line {
  const line = linesOf(chat, w, id, r.c).find((l) => l.id === message && l.event === null);
  return line ?? refuse("not-found");
}

/** Deletes a message: the sender's own, or, in a guild's, a member's the player ranks above (game-core's `deleteRefusal`). */
export function deleteIn({ chat, w, player }: ChatWrite, id: ConversationId, message: string): void {
  const r = readableOrRefuse(w, id, player);
  const line = lineOrRefuse(chat, w, id, r, message);
  const ranks = r.c.kind === "guild" ? { rank: rankIn(r.guild, player), authorRank: rankIn(r.guild, line.author) } : {};
  const refused = deleteRefusal(r.c.kind, { address: player, ...ranks }, line);
  if (refused) refuse(refused);
  const stored = chat.messages[id]?.find((m) => m.id === message);
  if (stored) stored.deleted = true;
  else chat.deleted[id] = [...(chat.deleted[id] ?? []), message];
}

/** What a report reveals of a line, the moderator's check of its commitment made. */
function revealOf(w: ChatWorld, id: ConversationId, l: Line): RevealedMessage {
  if (!l.sealed || !l.opened) return { id: l.id, author: l.author, at: l.at, text: l.text, frankingKey: null, commitment: null, checked: null };
  const { text, frankingKey } = l.opened;
  const checked = checkCommitment({ text, frankingKey, conversation: id, sender: l.author, at: l.sealed.header.at }, l.sealed.commitment);
  return { id: l.id, author: l.author, at: l.at, text, frankingKey, commitment: l.sealed.commitment, checked };
}

/**
 * Reports a message: recorded with what it reveals (#997, point 7): in the World the line; in private and in a guild, the
 * message and the 5 readable before it, decrypted, each with its franking key and commitment, checked as a moderator will.
 * An unreadable message cannot be reported.
 */
export function reportIn({ chat, w, player }: ChatWrite, id: ConversationId, message: string, reason: ChatReportReason): void {
  const r = readableOrRefuse(w, id, player);
  lineOrRefuse(chat, w, id, r, message);
  const lines = readableLines(chat, w, id, r.c, player, r.guild).filter((l) => l.event === null);
  const line = lines.find((l) => l.id === message) ?? refuse("not-found");
  if (line.unreadable) refuse("not-found");
  const already = chat.reports.some((x) => x.reporter === key(player) && x.conversation === id && x.message === message);
  const refused = reportRefusal(player, line, reason, already);
  if (refused) refuse(refused);
  const revealed = r.c.kind === "world" ? [line] : reportReveal(lines.filter((l) => l.id === message || (!l.deleted && !l.unreadable)), message);
  chat.reports.push({ reporter: key(player), conversation: id, message, author: line.author, reason, at: w.now, revealed: revealed.map((l) => revealOf(w, id, l)) });
}

/** Mutes `target`; muting twice keeps the first mute. */
export function muteIn({ chat, w, player }: ChatWrite, target: string): void {
  const refused = muteRefusal(player, target);
  if (refused) refuse(refused);
  if (!w.known(target)) refuse("unknown-player");
  if (isMuted(chat.mutes, player, target)) return;
  chat.mutes.push({ muter: key(player), muted: key(target), at: w.now });
}

/** Unmutes `target`; a mute not there is a no-op. */
export function unmuteIn({ chat, player }: ChatWrite, target: string): void {
  chat.mutes = chat.mutes.filter((m) => !(m.muter === key(player) && m.muted === key(target)));
}

/** Accepts or declines the request of a private conversation. */
export function answerRequestIn({ chat, w, player }: ChatWrite, id: ConversationId, accept: boolean): void {
  const r = readableOrRefuse(w, id, player);
  if (r.c.kind !== "private") return refuse("not-a-request");
  const refused = answerRequestRefusal(pairOf(chat, w, id, player, r.other!));
  if (refused) refuse(refused);
  chat.sides[sideKey(id, player)] = accept ? { accepted: true, declined: false } : { accepted: false, declined: true };
}

/** Changes the player's messaging key (#997, point 10): a new version, the old kept to read the history. For tests and stories. */
export function rotateKeysIn({ chat, w, player }: ChatWrite): void {
  const k = key(player);
  const version = (directoryOf(chat, w, k)?.version ?? 0) + 1;
  if (isCommunity(k)) chat.rotations[k] = version;
  else {
    const pair = newKeyPair(version);
    chat.keys[k] = [...(chat.keys[k] ?? []), { version, secretKey: bytesToHex(pair.secretKey), publicKey: bytesToHex(pair.publicKey), at: w.now }];
  }
  chat.keyChanges.push({ player: k, version, at: w.now });
  // The guilds they are in start a new epoch for the new key.
  settleEpochs(chat, w);
}

/** Marks a conversation read up to now. */
export function markReadIn({ chat, w, player }: ChatWrite, id: ConversationId): void {
  readableOrRefuse(w, id, player);
  chat.reads[sideKey(id, player)] = w.now;
}

export function seeNoticeIn({ chat, player }: ChatWrite): void {
  (chat.players[key(player)] ??= {}).noticeSeen = true;
}

/** The player's first visit to the Chat tab: the mock's stranger request comes `MOCK_REQUEST_S` later. */
export function visitChatIn({ chat, w, player }: ChatWrite): void {
  (chat.players[key(player)] ??= {}).firstVisit ??= w.now;
}

/**
 * The stored chat with the memberships a guild write ended (`before`: each guild's members before it, by guild ID), at `now`:
 * a member gone from their guild, or into another, has left it then.
 */
export function recordDepartures<T extends AnyStoredChat>(chat: T, before: ReadonlyMap<number, readonly { address: string; joinedAt: number }[]>, after: GuildWorld, now: number): T {
  const departed: Departure[] = [];
  for (const [guild, members] of before) {
    const still = after.guilds.find((g) => g.id === guild);
    for (const m of members) {
      const now_ = still?.members.find((x) => x.address === m.address);
      if (!now_ || now_.joinedAt !== m.joinedAt) departed.push({ guild, address: m.address, joinedAt: m.joinedAt, leftAt: now });
    }
  }
  return departed.length === 0 ? chat : ({ ...chat, departed: [...(chat.departed ?? []), ...departed] } as T);
}

/** A stored chat without anything of `player`: their messages, private conversations, sides, reads, mutes, reports, keys. */
export function forgetChat<T extends AnyStoredChat>(chat: T, player: string): T {
  const k = key(player);
  // Both versions' common fields, with a message's and a report's author only read: one walk for either.
  const next = structuredClone(chat) as unknown as Omit<StoredChatV1, "version" | "messages" | "reports"> &
    Partial<Pick<StoredChat, "keys" | "rotations" | "keyChanges" | "counters">> & { version: 1 | 2; messages: Record<ConversationId, { author: string }[]>; reports: { reporter: string }[] };
  for (const id of Object.keys(next.messages)) {
    if (otherPlayer(id, k) !== null) delete next.messages[id];
    else next.messages[id] = next.messages[id]!.filter((m) => m.author !== k);
  }
  const mine = (entry: string) => entry.endsWith(`|${k}`) || otherPlayer(entry.split("|")[0]!, k) !== null;
  next.sides = Object.fromEntries(Object.entries(next.sides).filter(([s]) => !mine(s)));
  next.reads = Object.fromEntries(Object.entries(next.reads).filter(([s]) => !mine(s)));
  next.mutes = next.mutes.filter((m) => m.muter !== k && m.muted !== k);
  next.reports = next.reports.filter((r) => r.reporter !== k);
  delete next.players[k];
  if (next.keys) delete next.keys[k];
  if (next.rotations) delete next.rotations[k];
  if (next.keyChanges) next.keyChanges = next.keyChanges.filter((c) => c.player !== k);
  if (next.counters) next.counters = Object.fromEntries(Object.entries(next.counters).filter(([s]) => !mine(s)));
  return next as unknown as T;
}
