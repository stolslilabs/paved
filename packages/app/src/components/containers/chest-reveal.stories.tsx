import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PLAN } from "../../mocks/village";
import { ChestReveal } from "./chest-reveal";

/** A chest opened (#739): its tiles by rank, the Cobbles when it held some; the tile kept goes to the inventory. */
const meta = {
  title: "Containers/ChestReveal",
  component: ChestReveal,
  args: { draw: { rank: "epic", plans: [PLAN.road, PLAN.wonder, PLAN.cityEdge], cobbles: null }, owned: { [PLAN.road]: 9, [PLAN.cityEdge]: 4 }, tileArt: originalTileArt(SOURCE_ASSETS), onTake: fn() },
} satisfies Meta<typeof ChestReveal>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Epic: one of 3. */
export const Epic: Story = {};
/** Rare: one of 2, one chosen. */
export const Rare: Story = { args: { draw: { rank: "rare", plans: [PLAN.roadCross, PLAN.stopRoads], cobbles: null }, initialChoice: 0 } };
/** Basic: one tile, no choice. */
export const Basic: Story = { args: { draw: { rank: "basic", plans: [PLAN.forestCity], cobbles: null } } };
/** Cobbles in the chest. */
export const CobblesWon: Story = { args: { draw: { rank: "epic", plans: [PLAN.road, PLAN.wonder, PLAN.cityEdge], cobbles: 50 } } };
/** The choice on its way. */
export const Busy: Story = { args: { initialChoice: 1, busy: true } };
