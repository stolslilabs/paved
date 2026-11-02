import { CHAT_MESSAGE_MAX, CHAT_WORLD_MIN_LEVEL, CHAT_WORLD_PER_MINUTE, formatInteger, type ChatReportReason } from "@paved/game-core";
import { ChatRefusedError, type ChatWriteRefusal, type ConversationSummary } from "../data/social-source";

// The messages' words (#955): why a write is refused, the report's reasons, and a conversation's name, as the Chat tab and
// the conversations say them. Game-core holds the rules; this is how the pages read them.

/**
 * Each chat refusal in words. `blocked` and `declined` say only that it is not available: the block and the declined request are
 * never shown to the other player (#954), so their words are those of any action that cannot be done.
 */
export const CHAT_REFUSALS: Record<ChatWriteRefusal, string> = {
  empty: "Write something first.",
  "too-long": `A message has at most ${formatInteger(CHAT_MESSAGE_MAX)} characters.`,
  "level-low": `Writing in the World opens at level ${formatInteger(CHAT_WORLD_MIN_LEVEL)}.`,
  "too-fast": "You are writing too fast: wait a moment.",
  "per-minute": `${formatInteger(CHAT_WORLD_PER_MINUTE)} messages a minute in the World, the most: wait a moment.`,
  repeat: "You just sent this: write something new.",
  "not-in-guild": "Only the guild's members write here.",
  "not-yours": "This conversation is not yours.",
  blocking: "You block this player: unblock them from their profile first.",
  blocked: "This is not available.",
  declined: "This is not available.",
  "not-author": "You can delete only your own messages.",
  "rank-not-above": "You can delete only the messages of members below your rank.",
  deleted: "This message is deleted already.",
  self: "You cannot do this to yourself.",
  "reported-already": "You reported this message already.",
  reason: "Pick a reason.",
  "not-a-request": "This request is not there any more.",
  "not-found": "It is not there any more.",
  "unknown-player": "This player is not there any more.",
};

/** A failed chat write in words: its refusal's, else its message. */
export const chatErrorText = (error: unknown): string => (error instanceof ChatRefusedError ? CHAT_REFUSALS[error.reason] : error instanceof Error ? error.message : "Something went wrong.");

/** The report's reasons, in the player's words. */
export const REPORT_REASONS: Record<ChatReportReason, { label: string; line: string }> = {
  spam: { label: "Spam", line: "The same lines over and over, or advertising." },
  scam: { label: "Scam", line: "Asks for a key, a password or tokens, or a link to one." },
  harassment: { label: "Harassment", line: "Insults, threats or hate." },
  other: { label: "Other", line: "Anything else that breaks the rules." },
};

/** A conversation's name: the World, the guild's name, or the other player's name (their short address when they have none). */
export function conversationName(c: Pick<ConversationSummary, "kind" | "guild" | "other">, short: (address: string) => string): string {
  if (c.kind === "world") return "World";
  if (c.kind === "guild") return c.guild?.name ?? "Guild";
  return c.other ? (c.other.name ?? short(c.other.address)) : "Private";
}

/** The notice of the first private conversation (#955). */
export const PRIVATE_NOTICE = "Your private messages are end-to-end encrypted. Paved never asks for your key or your password.";

// End-to-end encryption (#997): what each conversation's line, the Encryption sheet, the key's change, an unreadable message and
// the report's warning say.

/** The line at the top of a conversation: what is encrypted, and for whom (#997, point 8). */
export function encryptionLine(mode: "private" | "guild" | "public", otherName: string): string {
  if (mode === "private") return `End-to-end encrypted: only you and ${otherName} can read these messages`;
  if (mode === "guild") return "End-to-end encrypted for the guild's members";
  return "Public: every player can read the World";
}

/** A joiner's line in the guild's conversation (#997, open point 2). */
export const JOINER_LINE = "Messages from before you joined are not shown";

/** A sealed message this device cannot open, in the place of its text (#997, point 6). */
export const UNREADABLE_MESSAGE = "This message can't be read on this device";

/** The other player's new key, as a line of the conversation (#997, point 10). */
export const keyChangedLine = (otherName: string): string => `${otherName}'s security key changed`;

/** What the report dialog says is shared, in an encrypted conversation (#997, point 12). */
export const REPORT_REVEAL = "This message and the 5 before it go to Paved's moderators, decrypted. Nothing else of this conversation.";

/** The Encryption sheet's two lines on what is encrypted (#997, point 9). */
export const encryptionSheetLines = (otherName: string): [string, string] => [
  `Your messages with ${otherName} are sealed on your device and opened only on yours and theirs.`,
  "Paved stores them sealed and cannot read them, unless one of you reports a message.",
];
