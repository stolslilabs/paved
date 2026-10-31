import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CHAT_LIST } from "../../mocks/chat";
import { ChatList } from "./chat-list";

/**
 * The Social page's Chat tab (#955): the World, the guild's conversation, then the private ones by their last message, each with
 * its unread count (the World's quiet, never badged); a stranger's requests above them; and the tab's menu of muted players. On
 * the mock community.
 */
const meta = {
  title: "Containers/ChatList",
  component: ChatList,
  parameters: { layout: "padded" },
  args: { ...CHAT_LIST.conversations, onOpen: fn(), onRetry: fn(), onOpenPlayer: fn(), onUnmute: fn(async () => {}) },
  decorators: [(Story) => <div className="mx-auto max-w-xl">{Story()}</div>],
} satisfies Meta<typeof ChatList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The World, the guild and three private conversations, with their unread counts. */
export const Conversations: Story = {};
/** A player in no guild, with no private conversation yet. */
export const Guildless: Story = { args: CHAT_LIST.guildless };
/** A stranger's request, waiting above the conversations. */
export const Request: Story = { args: CHAT_LIST.request };
/** A muted player, in the tab's menu, with Unmute. */
export const Muted: Story = { args: CHAT_LIST.muted };
/** The menu with no one muted. */
export const NoneMuted: Story = { args: CHAT_LIST.noneMuted };
export const Loading: Story = { args: CHAT_LIST.loading };
export const Failed: Story = { args: CHAT_LIST.failed };
/** With reduced motion: the muted players' sheet opens without its slide. */
export const ReducedMotion: Story = { args: CHAT_LIST.muted, parameters: { reducedMotion: "always" } };
/** WRAP360: the longest names and addresses, four-digit counts, a long last line. */
export const Stress: Story = { args: CHAT_LIST.stress };
