import type { Meta, StoryObj } from "@storybook/react-vite";
import { PLACEMENT_STATES, PlacementBoard, placementArgTypes } from "./placement-board";
import { MAX_DISTANCE, MIN_DISTANCE, VIEWS } from "./outlines-tour";

/**
 * The placement visuals (SLOTS, P-68) on the recorded 72-tile board. The grid: pale, thin lines around the placed tiles,
 * fading ring by ring. With a tile in hand, every legal slot (any rotation) is a yellow cell with a neon border: dashed,
 * or solid and brighter where the current rotation fits. The tile placed on a slot: an aura with waves running up and
 * out, and a pale veil; red while its rotation does not fit there; green on confirm, then a fade to nothing. Every
 * setting is a control; under reduced motion the aura is still and the confirm short.
 */
const meta = {
  title: "Renderer/Placement",
  component: PlacementBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    state: {
      control: "inline-radio",
      options: PLACEMENT_STATES,
      type: { name: "enum", value: [...PLACEMENT_STATES] },
      description: "idle: the grid only; in-hand: the slots; placed: on a slot, yellow; placed-red: its rotation does not fit; confirm: green, fading out",
    },
    reducedMotion: { control: "boolean", description: "Reduced motion: a still aura, an instant colour change, a short fade (unset: the device's)" },
    replayMs: { control: { type: "range", min: 0, max: 4000, step: 100 }, description: "The confirm plays again every this many ms (0: once)" },
    view: { control: "select", options: VIEWS, description: "The camera's view (default: the game's opening view)" },
    distance: { control: { type: "range", min: MIN_DISTANCE, max: MAX_DISTANCE, step: 1 }, description: "Camera distance; unset, the view's own" },
    redraw: { control: "boolean", description: "Draw every frame even when nothing moves (frame-time measures)" },
    readout: { control: "boolean", description: "Show the state and the zoom" },
    force: { control: "inline-radio", options: ["auto", "on", "off"], description: "Outlines: auto turns them off on software WebGL; on and off force them" },
    maxPixelRatio: {
      control: { type: "select", labels: { auto: "auto", x1: "1", x1_5: "1.5", x2: "2" } },
      options: ["auto", "x1", "x1_5", "x2"],
      mapping: { auto: "auto", x1: 1, x1_5: 1.5, x2: 2 },
      description: "The pixel-ratio cap: auto is the device's",
    },
    ...placementArgTypes(),
  },
  args: { state: "in-hand", view: "default", redraw: false, readout: true, force: "auto", maxPixelRatio: "auto", replayMs: 1600 },
} satisfies Meta<typeof PlacementBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No tile in hand: the grid alone, around the board. */
export const IdleGrid: Story = { args: { state: "idle" } };

/** A tile in hand: its legal slots, dashed, solid where the current rotation fits. */
export const Slots: Story = { args: { state: "in-hand" } };

/** The tile placed on a slot its rotation fits: yellow aura and veil. */
export const PlacedYellow: Story = { args: { state: "placed" } };

/** Rotated so it no longer fits: red. Confirm is disabled. */
export const PlacedRed: Story = { args: { state: "placed-red" } };

/** Confirmed: green, then a fade to the tile's own look (played again every 1.6 s). */
export const ConfirmGreen: Story = { args: { state: "confirm" } };

/** Reduced motion: the placed tile's aura still; the confirm green at once with a short fade. */
export const ReducedMotion: Story = { args: { state: "placed", reducedMotion: true } };
