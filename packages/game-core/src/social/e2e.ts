// End-to-end encryption of the private and guild conversations (#997, the design of #998), pure: the messaging key pairs, a
// private conversation's key, sealing and opening a message, the guild's epoch keys wrapped for each member, the reports'
// commitments (message franking), the safety code and the key's binding to the account. The client's mock applies them today
// (`packages/app/src/data/mock/chat.ts`) and the social service will import the same code (#956, section 7). The World is
// public and never sealed (#997, open point 1).
//
// No primitive is made here: X25519 (RFC 7748) is `@noble/curves`', HKDF-SHA-256 (RFC 5869), HMAC-SHA-256 and SHA-256 are
// `@noble/hashes`', XChaCha20-Poly1305 (draft-irtf-cfrg-xchacha) is `@noble/ciphers`'; their published vectors are checked in
// `__tests__/e2e.test.ts`. This module is reached through its own entry, `@paved/game-core/e2e`, and never from the barrel, so
// that a bundle fetches it with the chat only.
//
// Keys travel as bytes; what is stored (an envelope, a wrap) holds hexadecimal strings.

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { bytesToUtf8, equalBytes, randomBytes as secureRandom } from "@noble/ciphers/utils.js";
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { parseConversation, type ConversationId } from "./chat";
import { playerKey } from "./follow";

export { bytesToHex, hexToBytes };

// --- Sizes -----------------------------------------------------------------------------------------------------------

/** A key (X25519's, a conversation's, an epoch's, a franking key), in bytes. */
export const E2E_KEY_BYTES = 32;
/** XChaCha20-Poly1305's nonce: 24 random bytes, so that random nonces never repeat in practice. */
export const E2E_NONCE_BYTES = 24;
/** Poly1305's tag. */
export const E2E_TAG_BYTES = 16;
/** A sealed message's plain part, padded to this length whatever its text, so that its length tells nothing (#997, point 3). */
export const E2E_PADDED_BYTES = 1024;
/** A report reveals the reported message and this many before it (#997, open point 3's default). */
export const E2E_REPORT_BEFORE = 5;

/** Random bytes: the platform's `crypto.getRandomValues` by default; a test passes its own. */
export type RandomBytes = (length: number) => Uint8Array;

const defaultRandom: RandomBytes = (length) => secureRandom(length);
const text = (s: string): Uint8Array => utf8ToBytes(s);
const ZERO_KEY = new Uint8Array(E2E_KEY_BYTES);

// --- Key pairs -------------------------------------------------------------------------------------------------------

/** A player's messaging key (X25519), apart from the account's Stark key, with its version (1, then one more at each change). */
export interface MessagingKeyPair {
  version: number;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

/** A messaging key as the directory serves it: its public part and version. */
export interface PublicMessagingKey {
  version: number;
  publicKey: Uint8Array;
}

/** The key pair of a secret key (32 bytes; X25519 clamps it). */
export function keyPairOf(secretKey: Uint8Array, version: number): MessagingKeyPair {
  if (secretKey.length !== E2E_KEY_BYTES) throw new Error("e2e: a secret key is 32 bytes");
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("e2e: a key's version is a whole number from 1");
  return { version, secretKey: Uint8Array.from(secretKey), publicKey: x25519.getPublicKey(secretKey) };
}

/** A new key pair, from 32 random bytes. */
export const newKeyPair = (version = 1, random: RandomBytes = defaultRandom): MessagingKeyPair => keyPairOf(random(E2E_KEY_BYTES), version);

/**
 * A key pair derived from a label by SHA-256, the same on every device: for a fixture or the mock's community players (whose
 * part the mock plays), never for a real player, whose key must be random (`newKeyPair`).
 */
export const labelledKeyPair = (label: string, version = 1): MessagingKeyPair => keyPairOf(sha256(text(`paved/labelled-key/v1|${label}|${version}`)), version);

/** The public part of a key pair. */
export const publicOf = (pair: MessagingKeyPair): PublicMessagingKey => ({ version: pair.version, publicKey: Uint8Array.from(pair.publicKey) });

/** X25519 of a secret key and another's public key; refuses a public key of small order (an all-zero secret). */
function sharedSecret(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  if (publicKey.length !== E2E_KEY_BYTES) throw new Error("e2e: a public key is 32 bytes");
  const shared = x25519.getSharedSecret(secretKey, publicKey);
  if (equalBytes(shared, ZERO_KEY)) throw new Error("e2e: a public key of small order");
  return shared;
}

// --- A private conversation's key --------------------------------------------------------------------------------------

/**
 * Both keys' versions of a private conversation, in the order of its players in its ID (`dm:<a>:<b>`), as `me` sees them:
 * what its envelopes' headers carry and its key is derived with, the same on both sides.
 */
export function privateVersions(conversation: ConversationId, me: string, mine: number, theirs: number): [number, number] {
  const c = parseConversation(conversation);
  if (c?.kind !== "private") throw new Error("e2e: not a private conversation");
  const k = playerKey(me);
  if (c.players[0] === k) return [mine, theirs];
  if (c.players[1] === k) return [theirs, mine];
  throw new Error("e2e: not a player of this conversation");
}

/**
 * A private conversation's key: HKDF-SHA-256 over X25519 (my secret key, their public key), salted with the conversation's
 * ID, its info `paved/dm/v1` and both versions. Both players derive the same key, so the sender reads what they sent.
 */
export function conversationKey(conversation: ConversationId, me: string, mine: MessagingKeyPair, theirs: PublicMessagingKey): Uint8Array {
  const [a, b] = privateVersions(conversation, me, mine.version, theirs.version);
  return hkdf(sha256, sharedSecret(mine.secretKey, theirs.publicKey), text(conversation), text(`paved/dm/v1|${a}|${b}`), E2E_KEY_BYTES);
}

// --- Envelopes ---------------------------------------------------------------------------------------------------------

/** A private message's header: its conversation, sender, both keys' versions (`privateVersions`), time and sender's counter. */
export interface PrivateHeader {
  conversation: ConversationId;
  sender: string;
  versions: readonly [number, number];
  /** Seconds. */
  at: number;
  /** The sender's count of their messages in the conversation, from 1: a replayed message repeats a counter. */
  counter: number;
}

/** A guild message's header: the guild's conversation, the epoch it is sealed in, the sender, the time and the counter. */
export interface GuildHeader {
  conversation: ConversationId;
  sender: string;
  epoch: number;
  at: number;
  counter: number;
}

export type EnvelopeHeader = PrivateHeader | GuildHeader;

/** A sealed message, as it is stored and relayed: its header in clear, then hexadecimal bytes. */
export interface Envelope {
  header: EnvelopeHeader;
  /** 24 random bytes. */
  nonce: string;
  /** XChaCha20-Poly1305 of the padded text and franking key, its tag at the end. */
  ciphertext: string;
  /** HMAC-SHA-256 under the franking key over the text, the conversation, the sender and the time (`commitment`). */
  commitment: string;
}

/** What opening a message gives: its text and its franking key (hexadecimal), which a report reveals. */
export interface OpenedMessage {
  text: string;
  frankingKey: string;
}

export const isGuildHeader = (h: EnvelopeHeader): h is GuildHeader => "epoch" in h;

/** The associated data of a header: so that a message cannot be moved to another conversation or epoch, nor replayed. */
export function headerBytes(h: EnvelopeHeader): Uint8Array {
  const scope = isGuildHeader(h) ? ["guild", h.epoch] : ["dm", h.versions[0], h.versions[1]];
  return text(JSON.stringify(["paved/e2e/v1", h.conversation, playerKey(h.sender), scope, h.at, h.counter]));
}

/** The text and franking key, padded to `E2E_PADDED_BYTES`: the text's length on 2 bytes, the text, the key, then zeros. */
function pad(message: string, frankingKey: Uint8Array): Uint8Array {
  const t = text(message);
  if (2 + t.length + E2E_KEY_BYTES > E2E_PADDED_BYTES) throw new Error("e2e: the text is too long to seal");
  const out = new Uint8Array(E2E_PADDED_BYTES);
  out[0] = t.length >> 8;
  out[1] = t.length & 0xff;
  out.set(t, 2);
  out.set(frankingKey, 2 + t.length);
  return out;
}

function unpad(padded: Uint8Array): { text: string; frankingKey: Uint8Array } | null {
  if (padded.length !== E2E_PADDED_BYTES) return null;
  const length = (padded[0]! << 8) | padded[1]!;
  const end = 2 + length + E2E_KEY_BYTES;
  if (end > E2E_PADDED_BYTES || padded.subarray(end).some((b) => b !== 0)) return null;
  return { text: bytesToUtf8(padded.subarray(2, 2 + length)), frankingKey: padded.slice(2 + length, end) };
}

/** What a commitment is computed over. */
export interface Committed {
  text: string;
  conversation: ConversationId;
  sender: string;
  at: number;
}

/** A message's commitment: HMAC-SHA-256 under its franking key over the text, the conversation, the sender and the time. */
export function commitment(frankingKey: Uint8Array, m: Committed): Uint8Array {
  if (frankingKey.length !== E2E_KEY_BYTES) throw new Error("e2e: a franking key is 32 bytes");
  return hmac(sha256, frankingKey, text(JSON.stringify(["paved/frank/v1", m.text, m.conversation, playerKey(m.sender), m.at])));
}

/**
 * Whether a revealed message matches its envelope's commitment: what a moderator checks of each message a report reveals, and
 * the reader's client of each message it opens. A wrong key or text, or a malformed one, fails.
 */
export function checkCommitment(revealed: Committed & { frankingKey: string }, expected: string): boolean {
  try {
    return equalBytes(commitment(hexToBytes(revealed.frankingKey), revealed), hexToBytes(expected));
  } catch {
    return false;
  }
}

/** The key a message is sealed with, from a conversation's or an epoch's key (`conversationKey`, `guildMessageKey`). */
const assertKey = (key: Uint8Array) => {
  if (key.length !== E2E_KEY_BYTES) throw new Error("e2e: a key is 32 bytes");
};

/**
 * Seals a message (its text as typed, normal form, before the word filter): a random franking key and nonce, the text and key
 * padded, XChaCha20-Poly1305 under `key` with the header as associated data, and the commitment.
 */
export function seal(key: Uint8Array, header: EnvelopeHeader, message: string, random: RandomBytes = defaultRandom): Envelope {
  assertKey(key);
  const frankingKey = random(E2E_KEY_BYTES);
  const nonce = random(E2E_NONCE_BYTES);
  const ciphertext = xchacha20poly1305(key, nonce, headerBytes(header)).encrypt(pad(message, frankingKey));
  const committed = commitment(frankingKey, { text: message, conversation: header.conversation, sender: header.sender, at: header.at });
  return { header: { ...header }, nonce: bytesToHex(nonce), ciphertext: bytesToHex(ciphertext), commitment: bytesToHex(committed) };
}

/**
 * Opens a message with its conversation's or epoch's key, or null: a wrong key, a changed header, nonce or ciphertext, or a
 * commitment that does not match its text (so that a sender cannot show a reader a text other than the one committed to).
 */
export function open(key: Uint8Array, envelope: Envelope): OpenedMessage | null {
  try {
    assertKey(key);
    const nonce = hexToBytes(envelope.nonce);
    if (nonce.length !== E2E_NONCE_BYTES) return null;
    const padded = xchacha20poly1305(key, nonce, headerBytes(envelope.header)).decrypt(hexToBytes(envelope.ciphertext));
    const plain = unpad(padded);
    if (!plain) return null;
    const h = envelope.header;
    const revealed = { text: plain.text, frankingKey: bytesToHex(plain.frankingKey), conversation: h.conversation, sender: h.sender, at: h.at };
    return checkCommitment(revealed, envelope.commitment) ? { text: plain.text, frankingKey: revealed.frankingKey } : null;
  } catch {
    return null;
  }
}

/**
 * Which envelopes of a conversation are replays, in the order the conversation keeps them (oldest first): true for one whose
 * sender's counter repeats a counter of theirs before it, or is not above it. The associated data stops a counter from being
 * changed; this stops a sealed message from being stored or relayed twice (#997, point 3). The first copy stays readable.
 * Pass only the headers of envelopes that opened (`open`): a header is authenticated by its envelope, so a forged counter
 * on one that does not open must not move its sender's count, or it would make their next messages look like replays.
 */
export function replayedEnvelopes(headers: readonly Pick<EnvelopeHeader, "sender" | "counter">[]): boolean[] {
  const last = new Map<string, number>();
  return headers.map((h) => {
    const sender = playerKey(h.sender);
    const before = last.get(sender);
    if (!Number.isSafeInteger(h.counter) || h.counter < 1 || (before !== undefined && h.counter <= before)) return true;
    last.set(sender, h.counter);
    return false;
  });
}

// --- The guild's epochs ------------------------------------------------------------------------------------------------

/**
 * A guild's epoch: 32 random bytes that seal its messages from its start to the next, wrapped for each member's messaging key.
 * One record: the guild's conversation, the epoch's number, its creator, its start, the members it covers and their wraps.
 */
export interface EpochRecord {
  conversation: ConversationId;
  epoch: number;
  creator: string;
  /** Seconds. */
  at: number;
  /** Player keys (`playerKey`), sorted. */
  members: string[];
  /** By member: the epoch's key wrapped for their key. */
  wraps: Record<string, KeyWrap>;
}

/** A key wrapped for one public key: a sealed box (an ephemeral X25519 key, HKDF-SHA-256, XChaCha20-Poly1305). */
export interface KeyWrap {
  /** The recipient's key version. */
  version: number;
  /** The recipient's public key (hexadecimal): the wrap names the key it is for, so that a replaced key is seen as changed. */
  publicKey: string;
  ephemeral: string;
  nonce: string;
  ciphertext: string;
}

/** A guild message's key: HKDF-SHA-256 of the epoch's key, salted with the conversation, its info the epoch's number. */
export function guildMessageKey(epochKey: Uint8Array, conversation: ConversationId, epoch: number): Uint8Array {
  assertKey(epochKey);
  return hkdf(sha256, epochKey, text(conversation), text(`paved/guild/v1|${epoch}`), E2E_KEY_BYTES);
}

const wrapContext = (conversation: ConversationId, epoch: number, member: string, version: number) => `paved/epoch/v1|${conversation}|${epoch}|${playerKey(member)}|${version}`;

function wrapKeyOf(ephemeral: Uint8Array, recipient: Uint8Array, shared: Uint8Array, context: string): Uint8Array {
  return hkdf(sha256, shared, concatBytes(ephemeral, recipient), text(context), E2E_KEY_BYTES);
}

/** Wraps a key for `member`'s public key, bound to the epoch (`conversation`, `epoch`) and to the member. */
export function wrapKey(key: Uint8Array, conversation: ConversationId, epoch: number, member: string, recipient: PublicMessagingKey, random: RandomBytes = defaultRandom): KeyWrap {
  assertKey(key);
  const eph = keyPairOf(random(E2E_KEY_BYTES), 1);
  const context = wrapContext(conversation, epoch, member, recipient.version);
  const k = wrapKeyOf(eph.publicKey, recipient.publicKey, sharedSecret(eph.secretKey, recipient.publicKey), context);
  const nonce = random(E2E_NONCE_BYTES);
  const ciphertext = xchacha20poly1305(k, nonce, text(context)).encrypt(key);
  return { version: recipient.version, publicKey: bytesToHex(recipient.publicKey), ephemeral: bytesToHex(eph.publicKey), nonce: bytesToHex(nonce), ciphertext: bytesToHex(ciphertext) };
}

/** Unwraps a key wrapped for `member` with their key pair (of the wrap's version), or null. */
export function unwrapKey(wrap: KeyWrap, conversation: ConversationId, epoch: number, member: string, mine: MessagingKeyPair): Uint8Array | null {
  try {
    if (mine.version !== wrap.version || bytesToHex(mine.publicKey) !== wrap.publicKey) return null;
    const ephemeral = hexToBytes(wrap.ephemeral);
    const context = wrapContext(conversation, epoch, member, wrap.version);
    const k = wrapKeyOf(ephemeral, mine.publicKey, sharedSecret(mine.secretKey, ephemeral), context);
    const key = xchacha20poly1305(k, hexToBytes(wrap.nonce), text(context)).decrypt(hexToBytes(wrap.ciphertext));
    return key.length === E2E_KEY_BYTES ? key : null;
  } catch {
    return null;
  }
}

/** A guild's members as an epoch covers them: each one's player key and current public key. */
export interface EpochMember {
  player: string;
  key: PublicMessagingKey;
}

/** A new epoch of a guild's conversation: a random key, wrapped for each member (#997, point 4). Answers its record and key. */
export function makeEpoch(
  params: { conversation: ConversationId; epoch: number; creator: string; at: number; members: readonly EpochMember[] },
  random: RandomBytes = defaultRandom,
): { record: EpochRecord; key: Uint8Array } {
  if (parseConversation(params.conversation)?.kind !== "guild") throw new Error("e2e: an epoch is a guild conversation's");
  const key = random(E2E_KEY_BYTES);
  const wraps: Record<string, KeyWrap> = {};
  for (const m of params.members) wraps[playerKey(m.player)] = wrapKey(key, params.conversation, params.epoch, m.player, m.key, random);
  const record: EpochRecord = { conversation: params.conversation, epoch: params.epoch, creator: playerKey(params.creator), at: params.at, members: Object.keys(wraps).sort(), wraps };
  return { record, key };
}

/** An epoch's key as `player` opens it with their keys (`ring`: every version they hold), or null: they are not covered. */
export function openEpoch(record: EpochRecord, player: string, ring: readonly MessagingKeyPair[]): Uint8Array | null {
  const wrap = record.wraps[playerKey(player)];
  const mine = wrap && ring.find((k) => k.version === wrap.version);
  return wrap && mine ? unwrapKey(wrap, record.conversation, record.epoch, player, mine) : null;
}

/**
 * Whether a guild's conversation needs a new epoch for its members now: none yet, or its members are not the latest epoch's (a
 * joining, a kick or a leave), or one of them has another key since (a new version, or another key of the same version, as a
 * device that lost its keys makes). A kicked or departed member cannot open the next one.
 */
export function epochDue(latest: EpochRecord | null, members: readonly EpochMember[]): boolean {
  if (!latest) return members.length > 0;
  const now = new Map(members.map((m) => [playerKey(m.player), m.key] as const));
  if (now.size !== latest.members.length) return true;
  return latest.members.some((p) => {
    const key = now.get(p);
    const wrap = latest.wraps[p];
    return !key || !wrap || key.version !== wrap.version || bytesToHex(key.publicKey) !== wrap.publicKey;
  });
}

// --- Reports ------------------------------------------------------------------------------------------------------------

/**
 * What a report reveals of a conversation (its messages oldest first): the reported message and the `E2E_REPORT_BEFORE`
 * before it, oldest first; empty when it is not there.
 */
export function reportReveal<T extends { id: string }>(messages: readonly T[], reported: string, before = E2E_REPORT_BEFORE): T[] {
  const at = messages.findIndex((m) => m.id === reported);
  return at < 0 ? [] : messages.slice(Math.max(0, at - before), at + 1);
}

// --- The safety code ----------------------------------------------------------------------------------------------------

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

/**
 * The safety code of two public keys, the same for both players: 20 digits in 4 groups of 5, from SHA-256 of both keys in
 * order. Two players who compare it in person know that nobody stands between them (#997, point 9).
 */
export function safetyCode(a: Uint8Array, b: Uint8Array): string {
  const [x, y] = compareBytes(a, b) <= 0 ? [a, b] : [b, a];
  const h = sha256(concatBytes(text("paved/safety/v1"), x, y));
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let n = 0;
    for (let i = 0; i < 5; i++) n = n * 256 + h[g * 5 + i]!;
    groups.push(String(n % 100_000).padStart(5, "0"));
  }
  return groups.join(" ");
}

// --- The key's binding ---------------------------------------------------------------------------------------------------

/** A messaging key bound to its account: the account's key signs it, so that the directory cannot slip in a key of its own. */
export interface KeyBinding {
  account: string;
  key: PublicMessagingKey;
  /** Seconds. */
  at: number;
}

/** The binding's SNIP-12 domain (revision 1): `'Paved Messaging Key'`, version `'1'`, with the chain's ID. */
export const KEY_BINDING_DOMAIN = { name: "Paved Messaging Key", version: "1", revision: "1" } as const;

/** SNIP-12's revision 1 types of a binding: the public key as a `u256`, its version as a `u128`, the time as a `timestamp`. */
export const KEY_BINDING_TYPES = {
  StarknetDomain: [
    { name: "name", type: "shortstring" },
    { name: "version", type: "shortstring" },
    { name: "chainId", type: "shortstring" },
    { name: "revision", type: "shortstring" },
  ],
  MessagingKey: [
    { name: "account", type: "ContractAddress" },
    { name: "public_key", type: "u256" },
    { name: "key_version", type: "u128" },
    { name: "time", type: "timestamp" },
  ],
} as const;

/** A binding as the SNIP-12 typed data the account's key signs (starknet.js's `typedData` hashes it, the account signs). */
export interface KeyBindingTypedData {
  types: typeof KEY_BINDING_TYPES;
  primaryType: "MessagingKey";
  domain: { name: string; version: string; chainId: string; revision: string };
  message: { account: string; public_key: { low: string; high: string }; key_version: string; time: string };
}

/** The typed data of a binding on `chainId` (a short string, e.g. `SN_SEPOLIA`, or a hexadecimal felt). */
export function keyBindingTypedData(binding: KeyBinding, chainId: string): KeyBindingTypedData {
  if (binding.key.publicKey.length !== E2E_KEY_BYTES) throw new Error("e2e: a public key is 32 bytes");
  const hex = bytesToHex(binding.key.publicKey);
  return {
    types: KEY_BINDING_TYPES,
    primaryType: "MessagingKey",
    domain: { ...KEY_BINDING_DOMAIN, chainId },
    message: { account: playerKey(binding.account), public_key: { low: `0x${hex.slice(32)}`, high: `0x${hex.slice(0, 32)}` }, key_version: String(binding.key.version), time: String(binding.at) },
  };
}

/** The binding a typed data holds, or null when it is not a binding of this domain (another name, version or revision). */
export function bindingOf(data: KeyBindingTypedData): KeyBinding | null {
  try {
    const d = data.domain;
    if (data.primaryType !== "MessagingKey" || d.name !== KEY_BINDING_DOMAIN.name || d.version !== KEY_BINDING_DOMAIN.version || d.revision !== KEY_BINDING_DOMAIN.revision) return null;
    const half = (h: string) => BigInt(h).toString(16).padStart(32, "0");
    const { low, high } = data.message.public_key;
    if (BigInt(low) >> 128n !== 0n || BigInt(high) >> 128n !== 0n) return null;
    const version = Number(data.message.key_version);
    const at = Number(data.message.time);
    if (!Number.isSafeInteger(version) || version < 1 || !Number.isSafeInteger(at)) return null;
    return { account: playerKey(data.message.account), key: { version, publicKey: hexToBytes(half(high) + half(low)) }, at };
  } catch {
    return null;
  }
}

/** Whether a binding names `account` and the key the directory serves (its bytes and version): checked before the key is used. */
export const bindingMatches = (binding: KeyBinding, account: string, key: PublicMessagingKey): boolean =>
  playerKey(binding.account) === playerKey(account) && binding.key.version === key.version && equalBytes(binding.key.publicKey, key.publicKey);
