import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PLAYER_STATUS } from "../../mocks/scenes";
import { PlayerStatus } from "./player-status";
import { BIG_NUMBER, LONG_NAME, STRESS_ENTRIES } from "../../mocks/stress";

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
/** WRAP360: the longest username, the widest rank and best. */
export const Stress: Story = {
  args: {
    data: {
      ...PLAYER_STATUS,
      player: { ...PLAYER_STATUS.player, name: LONG_NAME },
      stats: { ...PLAYER_STATUS.stats, challengeFinished: BIG_NUMBER, bestScore: BIG_NUMBER },
      today: { ...STRESS_ENTRIES[3] },
    },
  },
};
