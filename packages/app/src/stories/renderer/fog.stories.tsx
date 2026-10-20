import type { Meta, StoryObj } from "@storybook/react-vite";
import { AMBIENT_FPS, DEFAULT_FOG_SETTINGS, FIELD_REACH, QUALITY_TIERS, VILLAGE_MAX_CELLS } from "@paved/renderer";
import { PHONE_PLAY_DISTANCE } from "./birds-board";
import { FogBoard, type FogBoardProps } from "./fog-board";

const d = DEFAULT_FOG_SETTINGS;
const range = (min: number, max: number, step: number) => ({ control: { type: "range" as const, min, max, step } });
const category = (name: string) => ({ table: { category: name } });

/** The controls' defaults: the fog's defaults (the study's proposal) on the whole recorded board, a summer's day held, at the game's opening camera. */
const ARGS: FogBoardProps = {
  fog: d.enabled,
  falloff: d.falloff,
  voxelEdge: d.voxelEdge,
  billow: d.billow,
  noiseScale: d.noiseScale,
  drift: d.drift,
  driftDirection: d.driftDirection,
  color: d.color,
  shade: d.shade,
  opacity: d.opacity,
  mist: d.mist,
  mistHeight: d.mistHeight,
  nightShare: d.night,
  liftSeconds: d.liftSeconds,
  landscape: d.landscape.enabled,
  ground: d.landscape.ground,
  groundAlt: d.landscape.groundAlt,
  decor: d.landscape.decor,
  decorScale: d.landscape.decorScale,
  reveal: "board",
  placed: 72,
  villageCells: VILLAGE_MAX_CELLS,
  villageBuilt: 30,
  plates: true,
  autoplay: 0,
  interactive: true,
  view: "game",
  time: "day",
  enabled: true,
  reducedMotion: false,
  fps: AMBIENT_FPS,
  quality: "medium",
};

/**
 * The fog of war (FOG-STUDY), stories only: an option to study, the board does not use it. A fog over the whole scene but the
 * placed tiles and the free slots next to them (the cells where a tile could go next); placing a tile lifts the fog over its new
 * free neighbours, from the tile's side, in a short transition. Two goals: an exploration feel, and a cheap way to show an endless
 * landscape around the board (detail near the tiles, fog beyond).
 *
 * - **The edge**: hard (a line on the cells' border, `falloff` 0, optionally cut on the voxel grid) or soft (the fog thickens over
 *   `falloff` cells, its edge billowing with the noise).
 * - **The landscape**: a ground and props (trees, bushes, rocks, voxel by voxel as the models) beyond the clear cells, fading into
 *   the fog; a prop sinks into the ground as the fog lifts over its cell.
 * - **A PvP village**: the clear cells are a village's owned cells (at most 38) and the cells next to them (the ones it can buy).
 *
 * One field drives it: a small texture of the distance to the nearest clear cell, built on the CPU when the reveal changes and while
 * a cell lifts; the fog's floor, its mist and the props read it. One draw for the fog's floor (or the ground), one for the mist, one
 * per kind of prop. On the ambient loop: the fog drifts and lifts there; on the Low tier, with the effects off or under reduced
 * motion it stands still and a cell lifts at once (it stays on at every tier: it tells where a tile can go).
 *
 * Tap a slot (or "Place next") to place a tile there; in a village, tap an owned empty cell to build on it, a cell next to the
 * village to buy it. The readout gives the fog's draws and the frame's, the field's size and build time, the frames a second and
 * the CPU time of a frame (p95); on software WebGL the time is not a measure.
 */
const meta = {
  title: "Renderer/Fog of war",
  component: FogBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    fog: { control: "boolean", description: "The fog on", ...category("fog") },
    falloff: { ...range(0, FIELD_REACH - 1, 0.05), description: `The edge: 0 a hard line on the cells' border, above 0 a soft falloff over this many cells (default ${d.falloff})`, ...category("fog") },
    voxelEdge: { control: "boolean", description: "The edge and the fog's grain cut on the voxel grid, as the models", ...category("fog") },
    billow: { ...range(0, 1.5, 0.05), description: `How far the noise pushes a soft edge in and out, cells (default ${d.billow})`, ...category("fog") },
    noiseScale: { ...range(0.5, 8, 0.1), description: `The fog's billows, cells across (default ${d.noiseScale})`, ...category("fog") },
    drift: { ...range(0, 4, 0.05), description: `The fog's drift, world units a second; 0 still, the board idle (default ${d.drift})`, ...category("fog") },
    driftDirection: { ...range(0, 360, 5), description: `Where the drift goes, degrees (default ${d.driftDirection})`, ...category("fog") },
    color: { control: "color", description: `The fog's colour (default ${d.color})`, ...category("fog") },
    shade: { control: "color", description: `The shade of its billows (default ${d.shade})`, ...category("fog") },
    opacity: { ...range(0, 1, 0.01), description: `The fog's opacity at its thickest (default ${d.opacity})`, ...category("fog") },
    mist: { ...range(0, 1, 0.01), description: `A higher layer of mist in patches: its opacity, 0 none (default ${d.mist})`, ...category("fog") },
    mistHeight: { ...range(0.1, 4, 0.05), description: `The mist's height, world units (a tile's ground is 0.3; default ${d.mistHeight})`, ...category("fog") },
    nightShare: { ...range(0, 1, 0.05), description: `The fog's light at full night, a share of the day's (default ${d.night})`, ...category("fog") },
    liftSeconds: { ...range(0, 4, 0.05), description: `A cell lifts over this many seconds (default ${d.liftSeconds})`, ...category("fog") },

    landscape: { control: "boolean", description: "The ground and props beyond the clear cells, fading into the fog", ...category("landscape") },
    ground: { control: "color", description: `The ground's colour (default ${d.landscape.ground})`, ...category("landscape") },
    groundAlt: { control: "color", description: `Its second colour, in patches and voxels (default ${d.landscape.groundAlt})`, ...category("landscape") },
    decor: { ...range(0, 16, 1), description: `The props a forest cell holds (default ${d.landscape.decor})`, ...category("landscape") },
    decorScale: { ...range(0.25, 3, 0.05), description: `The props' size, times their own (default ${d.landscape.decorScale})`, ...category("landscape") },

    reveal: { control: "inline-radio", options: ["board", "village"], description: "What stays clear: the tiles and their free slots, or a village's owned cells and the cells next to them", ...category("board") },
    placed: { ...range(1, 72, 1), description: "Board: the recorded board's first tiles placed, in its order", ...category("board") },
    villageCells: { ...range(1, VILLAGE_MAX_CELLS, 1), description: `Village: the cells owned (at most ${VILLAGE_MAX_CELLS})`, ...category("board") },
    villageBuilt: { ...range(0, VILLAGE_MAX_CELLS, 1), description: "Village: how many owned cells hold a tile", ...category("board") },
    plates: { control: "boolean", description: "The free slots (or the owned empty and buyable cells) as plates", ...category("board") },
    autoplay: { ...range(0, 5, 0.25), description: "Place (or buy) the next every this many seconds; 0 by hand", ...category("board") },
    interactive: { control: "boolean", description: "A tap on a slot places a tile there; the 'Place next' button", ...category("board") },
    view: { control: "inline-radio", options: ["game", "phone-play", "far", "close"], description: `The game's opening camera, a phone's play distance (${PHONE_PLAY_DISTANCE}), the farthest (300), or close (40)`, ...category("board") },
    time: { control: "inline-radio", options: ["look", "day", "night"], description: "The look alone (the cycle off), or a summer's day or night held", ...category("board") },
    enabled: { control: "boolean", description: "The 'Ambient effects' setting: off, the fog stands still and lifts at once", ...category("board") },
    reducedMotion: { control: "boolean", description: "Reduced motion: the fog stands still and lifts at once", ...category("board") },
    fps: { ...range(5, 60, 1), description: `The ambient loop's rate cap (default ${AMBIENT_FPS})`, ...category("board") },
    quality: { control: "inline-radio", options: ["auto", ...QUALITY_TIERS], description: "Low: the fog stands still (it stays on)", ...category("board") },
  },
  args: ARGS,
} satisfies Meta<typeof FogBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A hard edge: a line on the cells' border, the fog thick right past it. */
export const HardEdge: Story = { args: { falloff: 0, mist: 0 } };

/**
 * The soft edge cut on the voxel grid, as the models are: the billows step voxel by voxel (on a straight hard edge, only the
 * corners would). A voxel is 2 to 4 device px at the game's distances.
 */
export const VoxelEdge: Story = { args: { voxelEdge: true, mist: 0, placed: 3, view: "phone-play" } };

/** A soft falloff (the study's proposal): the fog thickens over a cell and a half, its edge billowing, a patchy mist over it. */
export const SoftFalloff: Story = { args: {} };

/** The landscape: a ground and props beyond the clear cells, fading into the fog (an endless landscape, detail near the tiles). */
export const Landscape: Story = { args: { landscape: true, falloff: 2.5, billow: 0.7 } };

/** The landscape behind a hard edge: none of it shows, the fog starts at the border. */
export const LandscapeHardEdge: Story = { args: { landscape: true, falloff: 0, mist: 0 } };

/** A PvP village: 38 owned cells (30 built, 8 bought and empty) and the cells next to them, the ones it can buy (fainter plates). */
export const Village: Story = { args: { reveal: "village", landscape: true, falloff: 2.5 } };

/**
 * Interactive: the recorded board from its first three tiles. Tap a slot (or "Place next"): the tile goes there and the fog lifts
 * over its new free neighbours, from its side.
 */
export const Interactive: Story = { args: { placed: 3, landscape: true, falloff: 1.2, billow: 0.4, view: "phone-play" } };

/** The interactive board placing a tile every 1.5 s, on its own. */
export const Autoplay: Story = { args: { placed: 3, landscape: true, falloff: 1.2, billow: 0.4, autoplay: 1.5, view: "phone-play" } };

/** A village growing from four built cells: a cell bought, then built on, every 1.5 s; each cell bought lifts the fog over the cells next to it. */
export const VillageGrowing: Story = { args: { reveal: "village", villageCells: 4, villageBuilt: 4, landscape: true, falloff: 1.2, billow: 0.4, autoplay: 1.5, view: "phone-play" } };

/** The night: the fog dims to a moonlit blue, the landscape takes the night's light. */
export const Night: Story = { args: { landscape: true, falloff: 2.5, time: "night" } };

/** Reduced motion: the fog stands still and a cell lifts at once. */
export const ReducedMotion: Story = { args: { placed: 3, landscape: true, falloff: 2, reducedMotion: true, view: "phone-play" } };

/** The Low tier: the fog stays on, still. */
export const LowTier: Story = { args: { quality: "low", landscape: true, falloff: 2 } };

/** No fog: the board as it is today, for the comparison. */
export const Off: Story = { args: { fog: false } };
