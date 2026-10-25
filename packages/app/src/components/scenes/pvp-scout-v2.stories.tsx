import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PVP_V2_SCOUT } from "../../mocks/pvp-v2";
import { PvpScoutScene } from "./pvp-scout-scene";

/**
 * The PvP v2 scout (#740): the rival's free village and its score, the points of each star at 80 / 90 / 100 %, and the deck
 * the attack will have, ceil(1.15 x S) tiles sized on the village's slots, played on an open board.
 */
const meta = {
  title: "Scenes/PvP/Scout v2",
  component: PvpScoutScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_V2_SCOUT.ready, onBack: fn(), onNext: fn(), onAttack: fn() },
} satisfies Meta<typeof PvpScoutScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A level-12 village: 20 slots, a deck of 23 tiles (its 19 tiles and 4 extras). */
export const Ready: Story = { args: PVP_V2_SCOUT.ready };
export const Attacking: Story = { args: PVP_V2_SCOUT.attacking };
/** A level-1 village: 9 slots, a deck of 11. */
export const Small: Story = { args: PVP_V2_SCOUT.small };
