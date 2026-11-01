import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CHAT_LIST } from "../../mocks/chat";
import { ChatList } from "./chat-list";

/**
 * The chat page's Private tab (#973; the Social page's Chat tab of #955 before): New message, then the private conversations by
 * their last message, each with its unread count, then a stranger's requests. On the mock community.
 */
const meta = {
  title: "Containers/ChatList",
  component: ChatList,
  parameters: { layout: "padded" },
  args: { ...CHAT_LIST.conversations, onOpen: fn(), onRetry: fn(), onNewMessage: fn() },
  decorators: [(Story) => <div className="mx-auto max-w-xl">{Story()}</div>],
} satisfies Meta<typeof ChatList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Three private conversations, with their unread counts. */
export const Conversations: Story = {};
/** No private conversation yet. */
export const Empty: Story = { args: CHAT_LIST.guildless };
/** A stranger's request, waiting under the conversations. */
export const Request: Story = { args: CHAT_LIST.request };
export const Loading: Story = { args: CHAT_LIST.loading };
export const Failed: Story = { args: CHAT_LIST.failed };
/** WRAP360: the longest names and addresses, three-digit counts, a long last line. */
export const Stress: Story = { args: CHAT_LIST.stress };
