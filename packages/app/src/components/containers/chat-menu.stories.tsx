import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CHAT_MENU } from "../../mocks/chat";
import { ChatMenu } from "./chat-menu";

/** The chat page's menu (#973): the muted players (#955), each with Unmute, in a sheet. On the mock community. */
const meta = {
  title: "Containers/ChatMenu",
  component: ChatMenu,
  parameters: { layout: "padded" },
  args: { ...CHAT_MENU.muted, onUnmute: fn(async () => {}), onOpenPlayer: fn() },
} satisfies Meta<typeof ChatMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A muted player, with Unmute. */
export const Muted: Story = {};
/** No one muted. */
export const NoneMuted: Story = { args: CHAT_MENU.noneMuted };
/** The menu closed: its button alone. */
export const Closed: Story = { args: { initialMutedOpen: false } };
/** With reduced motion: the sheet opens without its slide. */
export const ReducedMotion: Story = { parameters: { reducedMotion: "always" } };
/** WRAP360: the longest names, and a player with no name. */
export const Stress: Story = { args: CHAT_MENU.stress };
