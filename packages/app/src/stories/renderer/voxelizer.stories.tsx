import type { Meta, StoryObj } from "@storybook/react-vite";
import { VOXELIZER_PLANS, VoxelizerReadout, VoxelizerTable } from "./voxelizer-readout";

/**
 * The voxelizer (VOXELIZER, P-84): the voxel grid of a tile model, rebuilt from the geometry the renderer loads, that the voxel
 * drop (#512) and the night windows (#513) build on. A plan selector, then the grid's counts, the build time, and a slice of one
 * layer in the palette's colours. Nothing here draws a board: the board does not call the voxelizer yet.
 */
const meta = {
  title: "Renderer/Voxelizer",
  component: VoxelizerReadout,
  parameters: { layout: "fullscreen" },
  argTypes: {
    plan: { control: "select", options: VOXELIZER_PLANS, description: "The plan whose model is voxelized" },
    layer: { control: { type: "range", min: 0, max: 34, step: 1 }, description: "The layer drawn (0 is the ground's first layer)" },
  },
  args: { plan: "ccccccccc", layer: 4 },
} satisfies Meta<typeof VoxelizerReadout>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One plan: counts, build time and a layer's slice. */
export const Plan: Story = {};

/** The ground slab's top layer, where the decor starts. */
export const SlabTop: Story = { args: { layer: 3 } };

/** The 19 plans, one row each, with their build time in this browser. */
export const AllPlans: Story = { render: () => <VoxelizerTable /> };
