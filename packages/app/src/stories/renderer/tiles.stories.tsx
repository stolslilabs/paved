import type { Meta, StoryObj } from "@storybook/react-vite";
import { TilesBoard } from "./tiles-board";

/**
 * The 19 plans' 2D tile images on a board (TEX): the plan view's tiles and the placeholder quads, from the 1680 px
 * originals (what the renderer drew before) or the app's 256 px copies. The readout counts
 * what the GPU holds for them.
 *
 * Measures and captures (`captures/tex-*.png`): headless Chromium on software WebGL (SwiftShader), a 360 x 740 phone
 * profile (touch, coarse pointer, device pixel ratio 2) and 1280 x 800; not a GPU render.
 */
const meta = {
  title: "Renderer/Tiles",
  component: TilesBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    view: { control: "inline-radio", options: ["plan", "quad"], description: "The plan view's tiles, or the quads of tiles whose models have not come" },
    images: { control: "inline-radio", options: ["original", "resized"], description: "The 1680 px originals, or the 256 px copies" },
  },
  args: { view: "plan", images: "resized" },
} satisfies Meta<typeof TilesBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The plan view, from the resized copies. */
export const PlanView: Story = {};

/** The placeholder quads, from the resized copies. */
export const Quads: Story = { args: { view: "quad" } };
