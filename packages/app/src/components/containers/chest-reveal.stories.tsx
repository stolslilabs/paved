import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { angledTileArt } from "../../mocks/assets";
import { PLAN } from "../../mocks/village";
import { ChestReveal } from "./chest-reveal";

/**
 * A chest opened (#739; CHESTS-PAGE, the Paved UX Book's reveal, the Chests' modal's and the victory screen's to come): its tiles as the
 * book's cards out of the chest, the one chosen in gold, the chest open, Take.
 */
const meta = {
  title: "Containers/ChestReveal",
  component: ChestReveal,
  args: { draw: { rank: "epic", plans: [PLAN.road, PLAN.wonder, PLAN.cityEdge] }, tileArt: angledTileArt, onTake: fn() },
  // The chosen card's light spreads past the cards: the modal's body clips it at the screen's edges, this frame does alone.
  decorators: [(Story) => <div style={{ overflowX: "clip" }}>{Story()}</div>],
} satisfies Meta<typeof ChestReveal>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Epic: one of 3. */
export const Epic: Story = {};
/** Rare: one of 2, one chosen (gold). */
export const Rare: Story = { args: { draw: { rank: "rare", plans: [PLAN.roadCross, PLAN.stopRoads] }, initialChoice: 0 } };
/** Basic: one tile, no choice. */
export const Basic: Story = { args: { draw: { rank: "basic", plans: [PLAN.forestCity] } } };
/** The choice on its way. */
export const Busy: Story = { args: { initialChoice: 1, busy: true } };
