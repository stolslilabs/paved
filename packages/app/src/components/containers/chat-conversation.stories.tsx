import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ChatRefusedError } from "../../data/social-source";
import { CHAT_CONVERSATION } from "../../mocks/chat";
import { ChatConversation } from "./chat-conversation";

/**
 * One conversation (#955): the World, a guild's (its announcement pinned, its log's lines), or a private one; the older messages
 * on scrolling up, the field at the foot (above a phone's keyboard), each message's menu (Profile, Mute, Report: no Delete, a
 * message stays on the ledger), a request's Accept and Decline, and the rules' refusals with their reasons. End-to-end encryption
 * (#997): the line under the title (the guild, or the public World; in private, the opening of an empty conversation), the Encryption sheet and its safety code, the other's key change, an unreadable
 * message, a joiner's line, and the report's warning. On the mock community.
 */
const meta = {
  title: "Containers/ChatConversation",
  component: ChatConversation,
  parameters: { layout: "padded" },
  args: {
    ...CHAT_CONVERSATION.world,
    onBack: fn(),
    onOpenTitle: fn(),
    onOpenPlayer: fn(),
    onLoadOlder: fn(),
    onRetry: fn(),
    onSeeNotice: fn(),
    onSend: fn(async () => {}),
    onAction: fn(async () => {}),
    onAnswer: fn(async () => {}),
  },
  decorators: [(Story) => <div className="mx-auto max-w-xl">{Story()}</div>],
} satisfies Meta<typeof ChatConversation>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The World: a link and an address kept as plain text, never clickable. */
export const World: Story = {};
/** Below level 2: the World is read, not written. */
export const WorldLevelLow: Story = { args: CHAT_CONVERSATION.worldLevelLow };
/** The rate limit: Send counts down the World's 5 seconds. */
export const RateLimited: Story = { args: CHAT_CONVERSATION.rateLimited };
/** A send refused by the World's 10 a minute: the reason under the field. */
export const PerMinute: Story = { args: { ...CHAT_CONVERSATION.world, initialDraft: "One more line", onSend: fn(async () => Promise.reject(new ChatRefusedError("per-minute"))) } };
/** The guild: its announcement pinned, the log's lines among the messages. */
export const Guild: Story = { args: CHAT_CONVERSATION.guild };
/** A private conversation with a friend: past its first message, no encryption line or notice (the conversation's menu keeps Encryption). */
export const Private: Story = { args: CHAT_CONVERSATION.private };
/** A stranger's request: Accept or Decline. */
/** Two-figure levels (#1065): the friend at level 10, in the head and beside their messages, both figures inside the star. */
export const TwoFigureLevels: Story = { args: CHAT_CONVERSATION.twoFigures };
export const Request: Story = { args: CHAT_CONVERSATION.request };
/** The player's own request, waiting in the other's Requests. */
export const AwaitingReply: Story = { args: CHAT_CONVERSATION.awaitingReply };
/** A player who blocks the viewer, or declined their request: only "not available". */
export const Unavailable: Story = { args: CHAT_CONVERSATION.unavailable };
/** Reporting a message: spam, scam, harassment or other. */
export const Report: Story = { args: CHAT_CONVERSATION.report };
/** The first private conversation, empty: it opens on what is encrypted, the notice that Paved never asks for a key or a password above the field. */
export const Empty: Story = { args: CHAT_CONVERSATION.empty };
/** A private conversation not there any more (the read found none): its message, and Back to the list (#1025). */
export const Gone: Story = { args: CHAT_CONVERSATION.gone };
export const Loading: Story = { args: CHAT_CONVERSATION.loading };
export const Failed: Story = { args: CHAT_CONVERSATION.failed };
/** With reduced motion: the dialogs open, and new messages appear, without motion. */
export const ReducedMotion: Story = { args: CHAT_CONVERSATION.report, parameters: { reducedMotion: "always" } };
/** #997: the Encryption sheet, from the private conversation's menu or its line: what is encrypted, and the safety code to compare. */
export const EncryptionSheet: Story = { args: CHAT_CONVERSATION.encryptionSheet };
/** #997: the friend's security key changed: a line among the messages, with "View code" (the new key's code). */
export const KeyChanged: Story = { args: CHAT_CONVERSATION.keyChanged };
/** #997: messages this device cannot open, in the place of their text, in a quiet bubble. They cannot be reported. */
export const Unreadable: Story = { args: CHAT_CONVERSATION.unreadable };
/** #997: a member who joined an hour ago reads from their joining on: the line says the messages from before are not shown. */
export const GuildJoiner: Story = { args: CHAT_CONVERSATION.guildJoiner };
/** #997: reporting a private message: the message and the 5 before it go to the moderators, decrypted. */
export const ReportPrivate: Story = { args: CHAT_CONVERSATION.reportPrivate };
/** #997: reporting a guild message: the same warning. */
export const ReportGuild: Story = { args: CHAT_CONVERSATION.reportGuild };
/** WRAP360 in private: the longest name and address in the lines, its key's change, an unreadable message, the sheet open. */
export const StressPrivate: Story = { args: CHAT_CONVERSATION.stressPrivate };
/** WRAP360: the longest name and address, a 200-character word, the guild's longest tag, a long announcement, a draft over the limit. */
export const Stress: Story = { args: CHAT_CONVERSATION.stress };
