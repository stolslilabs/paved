import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { appRenders } from "../../mocks/assets";
import { CHAT_CONVERSATION } from "../../mocks/chat";
import { CONQUEST_CHAT } from "../../mocks/conquest";
import { ChatConversation } from "./chat-conversation";
import { ConquestBuiltCard, ConquestRequestCard, conquestChatCards } from "./conquest-chat-cards";

/** The Conquest's cards of the guild's conversation: an open build request, and a tile just built. */
const meta = {
  title: "Containers/ConquestChatCards",
  component: ConquestRequestCard,
  args: { onOpen: fn(), renders: appRenders },
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
} satisfies Meta<typeof ConquestRequestCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A request the viewer can answer: they hold its tile. */
export const Request: Story = { args: { request: CONQUEST_CHAT.requests[0]! } };
/** A request whose tile the viewer does not hold. */
export const RequestNotHeld: Story = { args: { request: CONQUEST_CHAT.requests[1]! } };
export const Built: Story = { args: { request: CONQUEST_CHAT.requests[0]! }, render: () => <ConquestBuiltCard built={CONQUEST_CHAT.built[0]!} renders={appRenders} onOpen={fn()} /> };

/** The cards in the guild's conversation, each at its time among the messages (the proposal's "The chat carries it"). */
export const InTheChat: Story = {
  args: { request: CONQUEST_CHAT.requests[0]! },
  render: () => {
    const guild = CHAT_CONVERSATION.guild;
    const times = guild.messages.map((m) => m.at);
    // The request falls after the first message, the tile built after the last.
    const cards = conquestChatCards({ requests: [{ ...CONQUEST_CHAT.requests[0]!, at: (times[0] ?? 0) + 1 }], built: [{ ...CONQUEST_CHAT.built[0]!, at: (times[times.length - 1] ?? 0) + 1 }], renders: appRenders, onOpen: fn() });
    return <ChatConversation {...guild} cards={cards} />;
  },
};
