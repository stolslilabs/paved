import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PVP_DEFENCE } from "../../mocks/pvp";
import { PvpDefenceScene } from "./pvp-defence-scene";

/** The defence log (#647): the attacks on the player's village, their replays, the shield's timer. On fakes. */
const meta = {
  title: "Scenes/PvP/Defence log",
  component: PvpDefenceScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_DEFENCE.shielded, onBack: fn(), onReplay: fn(), onRetry: fn() },
} satisfies Meta<typeof PvpDefenceScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Attacked 2 h 48 ago: the 8-hour shield runs. One older attack has no replay kept. */
export const Shielded: Story = { args: PVP_DEFENCE.shielded };
/** No shield: the village can be attacked. */
export const Open: Story = { args: PVP_DEFENCE.open };
export const Empty: Story = { args: PVP_DEFENCE.empty };
export const Loading: Story = { args: PVP_DEFENCE.loading };
export const Failed: Story = { args: PVP_DEFENCE.error };
