import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CHAT_CONVERSATION, CHAT_LIST } from "../../mocks/chat";
import { ChatConversation } from "../containers/chat-conversation";
import { ChatList } from "../containers/chat-list";
import { ChatScene } from "./chat-scene";

/**
 * The chat page (`/chat`, #973, the Social page's Chat tab of #955 before): the conversations and the requests, and one
 * conversation open over the list. One story per state; the viewport is the toolbar's (VP). Its tabs (World, Guild, Private)
 * and New message are #973's second step.
 */
const meta = {
  title: "Scenes/Chat",
  component: ChatScene,
  args: { onBack: fn(), onNavigate: fn() },
} satisfies Meta<typeof ChatScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const list = (data: (typeof CHAT_LIST)[keyof typeof CHAT_LIST]) => <ChatList {...data} onOpen={fn()} onUnmute={fn(async () => {})} onOpenPlayer={fn()} />;
const conversation = (data: (typeof CHAT_CONVERSATION)[keyof typeof CHAT_CONVERSATION]) => (
  <ChatConversation {...data} onBack={fn()} onSend={fn(async () => {})} onAction={fn(async () => {})} onAnswer={fn(async () => {})} onOpenPlayer={fn()} />
);

/** A guest: the empty state. */
export const Guest: Story = {};
/** The World, the guild and the private conversations, by their last message. */
export const Conversations: Story = { args: { children: list(CHAT_LIST.conversations) } };
/** A stranger's request under the conversations. */
export const Request: Story = { args: { children: list(CHAT_LIST.request) } };
/** A player in no guild: the World and the private conversations only. */
export const Guildless: Story = { args: { children: list(CHAT_LIST.guildless) } };
/** The guild's conversation open: the announcement pinned, the log's lines. */
export const GuildConversation: Story = { args: { children: conversation(CHAT_CONVERSATION.guild) } };
/** A private conversation open, its notice shown the first time. */
export const PrivateConversation: Story = { args: { children: conversation(CHAT_CONVERSATION.private) } };
/** With reduced motion: the page opens without motion. */
export const ReducedMotion: Story = { args: { children: list(CHAT_LIST.request) }, parameters: { reducedMotion: "always" } };
/** WRAP360: the longest names, three-digit counts. */
export const Stress: Story = { args: { children: list(CHAT_LIST.stress) } };
