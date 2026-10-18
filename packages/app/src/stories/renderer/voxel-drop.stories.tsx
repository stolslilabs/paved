import type { ArgTypes, Meta, StoryObj } from "@storybook/react-vite";
import { VIEWS } from "./outlines-tour";
import {
  DROP_PLANS,
  FLASH_MODES,
  VoxelDropAllTiles,
  VoxelDropInContext,
  VoxelDropOneTile,
  dropArgTypes,
  type AllTilesProps,
  type InContextProps,
  type OneTileProps,
} from "./voxel-drop-board";

/**
 * The voxel drop (VOXEL-DROP, #512, P-77): a placed tile is built voxel by voxel, the voxels falling from the sky and landing
 * layer by layer from the bottom, within a layer from the centre to the edges, the whole tile in 1 to 2 s by its voxel count.
 * The animation is in `packages/renderer` (`GameScene.dropTile`); the app's board does not call it. These stories are there to
 * judge the look: one tile, every tile, and a tile placed on the recorded board. Every knob of the animation is a control, and
 * the readout gives the tile's voxels, instances, triangles, drop time and the voxelizer's build time in this browser.
 * Software WebGL (SwiftShader) draws it slowly and without the renderer's own outlines.
 */
const common = {
  ...dropArgTypes(),
  replayMs: { control: { type: "range", min: 0, max: 8000, step: 100 }, description: "Auto-replay every this many ms (0: only the Replay button)", table: { category: "replay" } },
  force: { control: "inline-radio", options: ["auto", "on", "off"], description: "The renderer's outlines: auto turns them off on software WebGL", table: { category: "board" } },
  forest: { control: "inline-radio", options: ["none", "all"], description: "Forest skin on every plan: the drop of the variant models", table: { category: "board" } },
};

const meta = {
  title: "Renderer/Voxel drop",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;

/** One tile, isolated: choose a plan, replay, slow it down. */
export const OneTile: StoryObj<OneTileProps> = {
  render: (args) => <VoxelDropOneTile {...args} />,
  argTypes: {
    ...common,
    plan: { control: "select", options: DROP_PLANS, description: "The plan whose tile drops", table: { category: "board" } },
    distance: { control: { type: "range", min: 8, max: 40, step: 1 }, description: "Camera distance", table: { category: "board" } },
  } as ArgTypes,
  args: { plan: "ccccccccc", forest: "none", replayMs: 3500, force: "auto", distance: 24 },
};

/** The 19 plans side by side, dropped together or one after the other. */
export const EveryTile: StoryObj<AllTilesProps> = {
  render: (args) => <VoxelDropAllTiles {...args} />,
  argTypes: {
    ...common,
    stagger: { control: { type: "range", min: 0, max: 1500, step: 50 }, description: "0: all at once; else each tile starts this many ms after the one before", table: { category: "replay" } },
    distance: { control: { type: "range", min: 12, max: 120, step: 1 }, description: "Camera distance", table: { category: "board" } },
  } as ArgTypes,
  args: { stagger: 0, forest: "none", replayMs: 0, force: "auto", distance: 88 },
};

/** A tile placed on a slot of the recorded board, at the game's camera: the drop replaces the green flash, or chains with it. */
export const InContext: StoryObj<InContextProps> = {
  render: (args) => <VoxelDropInContext {...args} />,
  argTypes: {
    ...common,
    flash: { control: "inline-radio", options: FLASH_MODES, description: "The confirm's green flash: replaced by the drop (default), alone, together with it, or after it", table: { category: "board" } },
    view: { control: "select", options: VIEWS, description: "The camera's view", table: { category: "board" } },
    distance: { control: { type: "range", min: 8, max: 300, step: 1 }, description: "Camera distance; unset, the view's own", table: { category: "board" } },
  } as ArgTypes,
  args: { flash: "drop only", view: "top", replayMs: 4000, force: "auto" },
};

