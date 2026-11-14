import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { CONQUEST_CHAT } from "../../mocks/conquest";
import { ConquestChatCards } from "./conquest-chat-cards";

/** The Conquest in the guild's chat: a live card per open build request, and the last tile built. */
const meta = {
  title: "Containers/ConquestChatCards",
  component: ConquestChatCards,
  args: { onGive: fn(), onOpen: fn(), onAll: fn(), tileArt: originalTileArt(SOURCE_ASSETS), className: "max-w-sm" },
} satisfies Meta<typeof ConquestChatCards>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Three requests, two shown; the viewer holds the first's tile. */
export const Requests: Story = { args: CONQUEST_CHAT };
/** No order left today: nothing is given. */
export const NoOrder: Story = { args: { ...CONQUEST_CHAT, orders: 0 } };
/** A gift on its way. */
export const Giving: Story = { args: { ...CONQUEST_CHAT, busy: true } };
/** Nothing asked: the last tile built alone. */
export const BuiltOnly: Story = { args: { ...CONQUEST_CHAT, requests: [] } };
