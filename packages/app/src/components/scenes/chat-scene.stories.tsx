import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CHAT_BADGES, CHAT_CONVERSATION, CHAT_LIST, CHAT_MENU, CHAT_NEW_MESSAGE } from "../../mocks/chat";
import { ChatConversation } from "../containers/chat-conversation";
import { ChatList } from "../containers/chat-list";
import { ChatMenu } from "../containers/chat-menu";
import { ChatNewMessage } from "../containers/chat-new-message";
import { ChatGuildless } from "../containers/chat-tabs";
import { ChatScene } from "./chat-scene";

/**
 * The chat page (`/chat`, #973; CHAT-PAGE, the Paved UX Book's "Chat" flow): the HUD's drawer, a full page with Back on a phone, a
 * side panel docked at the left from `tablet`. The book's three tabs, World, Guild and Private, each with its red badge (the World
 * none); the World's and the guild's conversation in their tab (the guild's pinned post above it), every avatar in its league's rim
 * with the level and the guild's tag; the private ones listed under the requests, one open over the list; New message; the page's
 * menu (the muted players). One story per state; the viewport is the toolbar's (VP).
 */
const meta = {
  title: "Scenes/Chat",
  component: ChatScene,
  parameters: { layout: "fullscreen" },
  args: { onBack: fn(), onTabChange: fn(), menu: <ChatMenu mutes={[]} onUnmute={fn(async () => {})} onOpenPlayer={fn()} /> },
} satisfies Meta<typeof ChatScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const list = (data: (typeof CHAT_LIST)[keyof typeof CHAT_LIST]) => <ChatList {...data} onOpen={fn()} onAnswer={fn(async () => {})} onNewMessage={fn()} />;
const conversation = (data: (typeof CHAT_CONVERSATION)[keyof typeof CHAT_CONVERSATION], back = false) => (
  <ChatConversation {...data} fill onBack={back ? fn() : undefined} onSend={fn(async () => {})} onAction={fn(async () => {})} onAnswer={fn(async () => {})} onOpenPlayer={fn()} />
);

/** A guest: the empty state, no tabs. */
export const Guest: Story = { args: { menu: undefined } };
/** The page finding its tab (a member's first visit opens on Guild once the overview is read). */
export const Opening: Story = { args: { tab: null } };
/** The World: its conversation in the tab, a guild's tag beside each name. */
export const World: Story = { args: { tab: "world", badges: CHAT_BADGES.conversations, children: conversation(CHAT_CONVERSATION.world) } };
/** Below level 2: the World is read, not written. */
export const WorldLevelLow: Story = { args: { tab: "world", badges: CHAT_BADGES.conversations, children: conversation(CHAT_CONVERSATION.worldLevelLow) } };
/** The guild: its announcement pinned, the log's lines among the messages. */
export const Guild: Story = { args: { tab: "guild", badges: CHAT_BADGES.conversations, children: conversation(CHAT_CONVERSATION.guild) } };
/** The guild with no announcement: its emblem, name and tag above the conversation, the way to its page. */
export const GuildUnpinned: Story = { args: { tab: "guild", badges: CHAT_BADGES.conversations, children: conversation(CHAT_CONVERSATION.guildUnpinned) } };
/** A player in no guild: the Guild tab's empty state, with the way to the guild page. */
export const Guildless: Story = { args: { tab: "guild", badges: CHAT_BADGES.guildless, children: <ChatGuildless onFindGuild={fn()} /> } };
/** Private: the conversations by their last message, then a stranger's request; New message on top. */
export const PrivateWithRequest: Story = { args: { tab: "private", badges: CHAT_BADGES.request, children: list(CHAT_LIST.request) } };
/** Private, for a player with no private conversation yet. */
export const PrivateEmpty: Story = { args: { tab: "private", badges: CHAT_BADGES.guildless, children: list(CHAT_LIST.guildless) } };
/** A private conversation open over the list; Back returns to the list. Past its first message, no encryption line or notice. */
export const PrivateConversation: Story = { args: { tab: "private", badges: CHAT_BADGES.conversations, children: conversation(CHAT_CONVERSATION.private, true) } };
/** The player's first private conversation, empty: it opens on what is encrypted, the notice above the field, until the first message. */
export const PrivateFirst: Story = { args: { tab: "private", badges: CHAT_BADGES.conversations, children: conversation(CHAT_CONVERSATION.empty, true) } };
/** A private conversation not there any more, open over the list: its message, and Back to the list (#1025). */
export const PrivateGone: Story = { args: { tab: "private", badges: CHAT_BADGES.conversations, children: conversation(CHAT_CONVERSATION.gone, true) } };
/** A stranger's request open: Accept or Decline. */
export const RequestOpen: Story = { args: { tab: "private", badges: CHAT_BADGES.request, children: conversation(CHAT_CONVERSATION.request, true) } };
/** New message, open over the Private tab: the friends, the guildmates, then the player search. */
export const NewMessage: Story = {
  args: {
    tab: "private",
    badges: CHAT_BADGES.conversations,
    children: (
      <>
        {list(CHAT_LIST.conversations)}
        <ChatNewMessage {...CHAT_NEW_MESSAGE.contacts} open onOpenChange={fn()} onPick={fn()} />
      </>
    ),
  },
};
/** The page's menu: the muted players' sheet. */
export const Muted: Story = { args: { tab: "world", badges: CHAT_BADGES.conversations, menu: <ChatMenu {...CHAT_MENU.muted} onUnmute={fn(async () => {})} onOpenPlayer={fn()} />, children: conversation(CHAT_CONVERSATION.world) } };
/** With reduced motion: the page and its tabs open without motion. */
export const ReducedMotion: Story = { args: { tab: "private", badges: CHAT_BADGES.request, children: list(CHAT_LIST.request) }, parameters: { reducedMotion: "always" } };
/** WRAP360: the longest names, three-digit badges, a long conversation. */
export const Stress: Story = { args: { tab: "private", badges: CHAT_BADGES.stress, children: list(CHAT_LIST.stress) } };
/** WRAP360: the guild's stress conversation in its tab. */
export const StressConversation: Story = { args: { tab: "guild", badges: CHAT_BADGES.stress, children: conversation(CHAT_CONVERSATION.stress) } };
