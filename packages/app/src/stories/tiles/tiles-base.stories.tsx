import type { Meta, StoryObj } from "@storybook/react-vite";
import { BaseExplorer, BasePlanGrid } from "./tile-browser";
import { BASE_PLANS, planFile } from "./tiles-data";

/**
 * The 19 base tiles the game plays (`asset-sources/models/<plan>.glb`), through the real renderer. One live canvas per
 * story: the grid switches the tile, and the grid itself is PNGs (the browser keeps about 16 WebGL contexts per page).
 */
const meta = {
  title: "Tiles/Base",
  component: BaseExplorer,
  parameters: { layout: "fullscreen" },
  argTypes: {
    plan: { control: "select", options: BASE_PLANS.map(planFile), description: "Plan key, nine letters" },
    orientation: { control: { type: "radio" }, options: [1, 2, 3, 4], description: "1 North to 4 West" },
  },
  args: { plan: planFile(BASE_PLANS[0]), orientation: 1 },
} satisfies Meta<typeof BaseExplorer>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One canvas, the plan's PNG, its model file and the four orientations; pick another plan from the grid. */
export const Viewer: Story = {};

/** A tile with its sides: the road-and-city plan turned east. */
export const Rotated: Story = { args: { plan: "cccccfrfc", orientation: 2 } };

/** All 19 plans as PNGs with their codes: no canvas. */
export const Overview: Story = { render: () => <BasePlanGrid /> };
