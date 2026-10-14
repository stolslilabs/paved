import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExtendedExplorer, ExtendedIndex, ExtraTiles } from "./tile-browser";
import { BASE_PLANS, EXTRA_TILES, planFile } from "./tiles-data";

/**
 * The 144 variant models of `origin/dev` (`public/models/extended/<plan>_LF_<n>.glb` and `_HF_<n>.glb`: low and high
 * forest density; PR #162, 2024), through the real renderer. The game does not play them. One live canvas per story: the
 * variant buttons switch the model; the index and the 2D tiles are PNGs and text.
 */
const meta = {
  title: "Tiles/Extended",
  component: ExtendedExplorer,
  parameters: { layout: "fullscreen" },
  argTypes: {
    plan: { control: "select", options: BASE_PLANS.map(planFile), description: "Plan key, nine letters" },
    density: { control: { type: "radio" }, options: ["LF", "HF"], description: "Low or high forest density" },
    n: { control: { type: "number", min: 1, max: 9 }, description: "Variant, from 1 (a plan has 1 to 9)" },
    orientation: { control: { type: "radio" }, options: [1, 2, 3, 4], description: "1 North to 4 West" },
  },
  args: { plan: "rfrfffffr", density: "LF", n: 1, orientation: 1 },
} satisfies Meta<typeof ExtendedExplorer>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One canvas on one variant; the buttons list every variant of the plan, the grid every plan. */
export const Viewer: Story = {};

export const HighForestDensity: Story = { args: { density: "HF", n: 3 } };

/** All 144 files by plan, low then high density: no canvas. */
export const Index: Story = { render: () => <ExtendedIndex /> };

/** The 18 2D tiles of the old game that the 19-model set lacks, with no model: PNGs. */
export const WithoutModel: Story = { render: () => <ExtraTiles tiles={EXTRA_TILES} /> };
