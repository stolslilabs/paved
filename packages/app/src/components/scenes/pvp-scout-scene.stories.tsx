import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PVP_SCOUT } from "../../mocks/pvp";
import { PvpScoutScene } from "./pvp-scout-scene";

/**
 * The PvP scout (#647): the defender's village (its territory and tiles, played on the engine), its score the target, the
 * points and crowns of each star, the loss, and "Next" at its Cobble price. On fakes, the plan view of the game's board.
 */
const meta = {
  title: "Scenes/PvP/Scout",
  component: PvpScoutScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_SCOUT.ready, onBack: fn(), onNext: fn(), onAttack: fn() },
} satisfies Meta<typeof PvpScoutScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = { args: PVP_SCOUT.ready };
/** The attacker's own village is shielded: attacking drops the shield (owner decision). */
export const Shielded: Story = { args: PVP_SCOUT.shielded };
/** Fewer Cobbles than "Next" costs: it is disabled. */
export const NotEnoughCobbles: Story = { args: PVP_SCOUT.short };
export const NextPending: Story = { args: PVP_SCOUT.nextPending };
export const Attacking: Story = { args: PVP_SCOUT.attacking };
export const Failed: Story = { args: PVP_SCOUT.error };
