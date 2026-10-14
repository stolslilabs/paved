import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PLAYER_STATUS } from "../../mocks/scenes";
import { PlayerStatus } from "./player-status";

const meta = {
  title: "Containers/PlayerStatus",
  component: PlayerStatus,
  parameters: { layout: "padded" },
  args: { data: PLAYER_STATUS, onConnect: fn() },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
} satisfies Meta<typeof PlayerStatus>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};
/** No finished game today: no rank yet. */
export const NoRankToday: Story = { args: { data: { ...PLAYER_STATUS, today: null } } };
export const NoUsername: Story = { args: { data: { ...PLAYER_STATUS, player: { ...PLAYER_STATUS.player, name: null } } } };
export const Guest: Story = { args: { data: null } };
export const Connecting: Story = { args: { data: null, connecting: true } };
