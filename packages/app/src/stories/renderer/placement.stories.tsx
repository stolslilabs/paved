import type { Meta, StoryObj } from "@storybook/react-vite";
import { DAY_PHASES, LOOK_PRESET_NAMES, QUALITY_TIERS } from "@paved/renderer";
import { PLACEMENT_STATES, PlacementBoard, placementArgTypes } from "./placement-board";
import { MAX_DISTANCE, MIN_DISTANCE, VIEWS } from "./outlines-tour";

/**
 * The placement visuals (PLACEMENT-TINTS) on the recorded 72-tile board: with a tile in hand, a flat plate on every free
 * cell next to a tile, a rounded rectangle inset in its cell (a gap between neighbours), lying at the tiles' bottom
 * (#588). One grey with no hue for both states, told apart by opacity alone: playable (some rotation fits) 0.55,
 * invalid (none fits) 0.2. The tile in hand is tinted on the model
 * itself: no tint at 50 % opacity on a hover, yellow and opaque once placed (#568, blue and 90 % before), a temporary
 * green on confirm fading to none. No rim, no aura. `Sequence` plays the game's placement: hover, placed with its bubble,
 * the hold on Validate, the voxel drop, then the green. Each change eases over 150 ms (at once under reduced
 * motion). Every setting is a control (colours, strengths, opacities, durations, the plates' radius and opacities; sizes
 * in voxels, a tile is 40); the ring grid is one, off by default.
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
      description: "idle: no plate; in-hand: the plates; hover: untinted, half opacity; placed: yellow, opaque; confirm: green tint fading out; tour: hover, placed, confirm in turn; sequence: hover, placed with the bubble, the hold, the drop, the green",
    },
    holdMs: { control: { type: "range", min: 200, max: 10000, step: 50 }, description: "sequence: Validate's hold, ms (800 in the game)" },
    dropSpeed: { control: { type: "range", min: 0.05, max: 2, step: 0.05 }, description: "The voxel drop's clock (1 in the game); slowed for a capture played back faster" },
    board: { control: "boolean", description: "The board's tiles under the plates; off, the plates alone" },
    reducedMotion: { control: "boolean", description: "Reduced motion: an instant change of state, a short fade (unset: the device's)" },
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
    quality: {
      control: "inline-radio",
      options: ["auto", ...QUALITY_TIERS],
      type: { name: "enum", value: ["auto", ...QUALITY_TIERS] },
      description: "Graphics quality: auto is the device's (Medium on desktops and phones)",
    },
    dayPhase: { control: "inline-radio", options: ["off", ...DAY_PHASES], description: "The day and night cycle held at a phase of a summer's day; off, the look alone" },
    lookPreset: { control: "inline-radio", options: LOOK_PRESET_NAMES, type: { name: "enum", value: [...LOOK_PRESET_NAMES] }, description: "The look the board is lit with" },
    ...placementArgTypes(),
  },
  args: { quality: "auto", lookPreset: "mockup", state: "in-hand", board: true, view: "default", redraw: false, readout: true, force: "auto", maxPixelRatio: "auto", replayMs: 1600 },
} satisfies Meta<typeof PlacementBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A tile in hand: its plates, one grey, playable (0.55) and invalid (more transparent, 0.2). */
export const Plates: Story = { args: { state: "in-hand" } };

/** The plates at dusk, the cycle held there (#588: both states told apart by day, dusk and night). */
export const PlatesDusk: Story = { args: { state: "in-hand", dayPhase: "dusk" } };

/** The plates at night, the cycle held there. */
export const PlatesNight: Story = { args: { state: "in-hand", dayPhase: "night" } };

/** From the side, at the steepest tilt, close (50 units, on the board's middle tile): the plates lie level with the tiles' bottom (#588). */
export const PlatesSide: Story = { args: { state: "in-hand", view: "zoomed-in", distance: 50 } };

/** The plates alone, no tile: their shape and colour, every one a control. */
export const PlatesAlone: Story = { args: { state: "in-hand", board: false, view: "top", distance: 90 } };

/** No tile in hand: no plate. */
export const Idle: Story = { args: { state: "idle" } };

/** The ring grid of SLOTS2, a setting now off by default, turned on. */
export const IdleGrid: Story = { args: { state: "idle", gridEnabled: true } };

/** The tile hovering a plate: the model untinted at half opacity, no inner face showing through. */
export const Hover: Story = { args: { state: "hover" } };

/** Hover, placed, confirm in turn: the states of the owner's feedback, for a capture. */
export const Tour: Story = { args: { state: "tour" } };

/** The tile placed on a plate its rotation fits: the model yellow and opaque. */
export const Placed: Story = { args: { state: "placed" } };

/** Confirmed: the tile green, then a fade to its own look (played again every 1.6 s). */
export const ConfirmGreen: Story = { args: { state: "confirm" } };

/** Reduced motion: every change at once, the confirm a short fade. */
export const ReducedMotion: Story = { args: { state: "placed", reducedMotion: true } };

/**
 * The game's placement (PLACE-POLISH, #568), at 375 px first: the tile hovers (untinted, half opacity), is placed (yellow,
 * opaque) with its bubble; hold Validate (about 0.8 s, the ring fills): the tile lands voxel by voxel, then a green tint
 * fades on it. The next tile hovers again after `replayMs`. Under reduced motion the drop is skipped: straight to the green.
 */
export const Sequence: Story = { args: { state: "sequence", replayMs: 3000 } };

/** The sequence under reduced motion: no drop, the green at once. */
export const SequenceReducedMotion: Story = { args: { state: "sequence", replayMs: 3000, reducedMotion: true } };
