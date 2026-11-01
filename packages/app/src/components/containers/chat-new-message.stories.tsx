import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CHAT_NEW_MESSAGE } from "../../mocks/chat";
import { ChatNewMessage } from "./chat-new-message";

/**
 * New message (#973), from the chat page's Private tab: the friends, the guildmates who are not friends, then the player search;
 * picking a player opens the conversation. On the mock community.
 */
const meta = {
  title: "Containers/ChatNewMessage",
  component: ChatNewMessage,
  parameters: { layout: "padded" },
  args: { ...CHAT_NEW_MESSAGE.contacts, open: true, onOpenChange: fn(), onPick: fn() },
} satisfies Meta<typeof ChatNewMessage>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Friends and guildmates (a friend in the guild shows once, among the friends). */
export const Contacts: Story = {};
/** A player in no guild with no friend yet: a name typed and found. */
export const Searching: Story = { args: CHAT_NEW_MESSAGE.searching };
export const Loading: Story = { args: CHAT_NEW_MESSAGE.loading };
/** With reduced motion: the sheet opens without its slide. */
export const ReducedMotion: Story = { parameters: { reducedMotion: "always" } };
/** WRAP360: the longest names and addresses. */
export const Stress: Story = { args: CHAT_NEW_MESSAGE.stress };
