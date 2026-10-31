import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ChatRefusedError } from "../../data/social-source";
import { CHAT_CONVERSATION } from "../../mocks/chat";
import { ChatConversation } from "./chat-conversation";

/**
 * One conversation (#955): the World, a guild's (its announcement pinned, its log's lines), or a private one; the older messages
 * on scrolling up, the field at the foot (above a phone's keyboard), each message's menu (Profile, Mute, Report, Delete), a
 * request's Accept and Decline, and the rules' refusals with their reasons. On the mock community.
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

/** The World: each author's guild tag; a link and an address kept as plain text, never clickable; a deleted message. */
export const World: Story = {};
/** Below level 2: the World is read, not written. */
export const WorldLevelLow: Story = { args: CHAT_CONVERSATION.worldLevelLow };
/** The rate limit: Send counts down the World's 5 seconds. */
export const RateLimited: Story = { args: CHAT_CONVERSATION.rateLimited };
/** A send refused by the World's 10 a minute: the reason under the field. */
export const PerMinute: Story = { args: { ...CHAT_CONVERSATION.world, initialDraft: "One more line", onSend: fn(async () => Promise.reject(new ChatRefusedError("per-minute"))) } };
/** The guild: its announcement pinned, the log's lines among the messages, and Delete on a member's message for an Officer. */
export const Guild: Story = { args: CHAT_CONVERSATION.guild };
/** A private conversation with a friend, the first one: the notice that Paved never asks for a key or a password. */
export const Private: Story = { args: CHAT_CONVERSATION.private };
/** A stranger's request: Accept or Decline. */
export const Request: Story = { args: CHAT_CONVERSATION.request };
/** The player's own request, waiting in the other's Requests. */
export const AwaitingReply: Story = { args: CHAT_CONVERSATION.awaitingReply };
/** A player who blocks the viewer, or declined their request: only "not available". */
export const Unavailable: Story = { args: CHAT_CONVERSATION.unavailable };
/** Reporting a message: spam, scam, harassment or other. */
export const Report: Story = { args: CHAT_CONVERSATION.report };
export const Empty: Story = { args: CHAT_CONVERSATION.empty };
export const Loading: Story = { args: CHAT_CONVERSATION.loading };
export const Failed: Story = { args: CHAT_CONVERSATION.failed };
/** With reduced motion: the dialogs open, and new messages appear, without motion. */
export const ReducedMotion: Story = { args: CHAT_CONVERSATION.report, parameters: { reducedMotion: "always" } };
/** WRAP360: the longest name and address, a 200-character word, the guild's longest tag, a long announcement, a draft over the limit. */
export const Stress: Story = { args: CHAT_CONVERSATION.stress };
