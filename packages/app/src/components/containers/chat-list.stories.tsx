import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CHAT_LIST } from "../../mocks/chat";
import { INBOX_MAIL } from "../../mocks/puzzle";
import { ChatList } from "./chat-list";
import { MailSection } from "./inbox-mail";

/**
 * The chat page's Private tab (#973; CHAT-PAGE, the Paved UX Book's "chat-private"): New message at the top right, then a stranger's
 * requests with their check and cross, then the private conversations by their last message, each in its league's rim with its
 * level, guild's tag and unread count. On the mock community.
 */
const meta = {
  title: "Containers/ChatList",
  component: ChatList,
  parameters: { layout: "padded" },
  args: { ...CHAT_LIST.conversations, onOpen: fn(), onAnswer: fn(async () => {}), onRetry: fn(), onNewMessage: fn() },
  decorators: [(Story) => <div className="mx-auto max-w-xl">{Story()}</div>],
} satisfies Meta<typeof ChatList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Three private conversations, with their unread counts. */
export const Conversations: Story = {};
/** The Inbox with its Mail at the top (PUZZLE-MODE): two Puzzle prizes waiting, Claim all, a claimed one; then the Messages. */
export const WithMail: Story = { args: { mail: <MailSection {...INBOX_MAIL.stacked} onClaimAll={fn()} onOpen={fn()} /> } };
/** No private conversation yet. */
export const Empty: Story = { args: CHAT_LIST.guildless };
/** A stranger's request over the conversations: "Wants to chat", the check and the cross. */
export const Request: Story = { args: CHAT_LIST.request };
/** Two-figure levels (#1065): the other players at levels 9, 10 and 20, both figures inside the star. */
export const TwoFigureLevels: Story = { args: CHAT_LIST.twoFigures };
export const Loading: Story = { args: CHAT_LIST.loading };
export const Failed: Story = { args: CHAT_LIST.failed };
/** WRAP360: the longest names and addresses, three-digit counts, a long last line. */
export const Stress: Story = { args: CHAT_LIST.stress };
