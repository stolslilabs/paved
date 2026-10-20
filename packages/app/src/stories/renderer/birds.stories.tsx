import type { Meta, StoryObj } from "@storybook/react-vite";
import { AMBIENT_FPS, DEFAULT_BIRD_SETTINGS, QUALITY_TIERS } from "@paved/renderer";
import { BIRD_PLANS, BirdsBoard, PHONE_PLAY_DISTANCE } from "./birds-board";

const d = DEFAULT_BIRD_SETTINGS;
const range = (min: number, max: number, step: number) => ({ control: { type: "range" as const, min, max, step } });
const birds = { table: { category: "birds" } };
const board = { table: { category: "board" } };

/**
 * The birds (BIRDS, #574), stories only: the board does not call them. Now and then one bird, or a small flock (boids: apart,
 * along, together), rises out of a tree's crown, flies low to another tree and sinks into its crown; none flies at night (they
 * roost). The perches are the tree tops of each model type, read once per type off its voxels: a vegetation column at least three
 * voxels over the ground, the highest within two columns, one per crown. The birds are a few cubes, their wings beating in the
 * vertex shader; one instanced draw while one flies, none otherwise. They step on the one ambient loop (#572), at its capped rate,
 * and stop with it: tab hidden, board covered, effects off, the Low tier.
 *
 * "Fly now" starts a flight at once. The readout names the renderer: on software WebGL its frame time is not a measure.
 */
const meta = {
  title: "Renderer/Birds",
  component: BirdsBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    intervalSeconds: { ...range(1, 60, 1), description: `A flight every this many seconds on average (default ${d.intervalSeconds})`, ...birds },
    flockShare: { ...range(0, 1, 0.05), description: `The share of flights that are a flock: 0 always one bird, 1 always a flock (default ${d.flockShare})`, ...birds },
    flockSize: { ...range(2, 12, 1), description: `The most birds in a flock: a flock draws two to this many (default ${d.flockSize})`, ...birds },
    speed: { ...range(0.5, 8, 0.1), description: `Cruise speed, world units a second; a tile is 3 (default ${d.speed})`, ...birds },
    flightHeight: { ...range(0, 4, 0.05), description: `How high over the higher tree they fly, world units (default ${d.flightHeight})`, ...birds },
    takeoffSeconds: { ...range(0.2, 3, 0.05), description: `Rising out of the crown, seconds (default ${d.takeoffSeconds})`, ...birds },
    landingSeconds: { ...range(0.2, 3, 0.05), description: `Gliding down onto the other tree, seconds (default ${d.landingSeconds})`, ...birds },
    rangeTiles: { ...range(0.5, 8, 0.25), description: `The farthest a flight goes, in tiles (default ${d.rangeTiles})`, ...birds },
    size: { ...range(0.05, 0.8, 0.01), description: `The bird's length, world units; a voxel is 0.075 (default ${d.size})`, ...birds },
    color: { control: "color", description: `The bird's colour (default ${d.color})`, ...birds },
    shadows: { control: "boolean", description: "Shadows: the board's shadow map is redrawn on every step a bird flies (default off)", ...birds },
    flapHz: { ...range(0, 15, 0.5), description: `Wingbeats a second (default ${d.flapHz})`, ...birds },
    fps: { ...range(5, 60, 1), description: `The ambient loop's rate cap (default ${AMBIENT_FPS})`, ...birds },
    perches: { control: "boolean", description: "Show the perches found (small pink cubes; one more draw)", ...board },
    layout: { control: "inline-radio", options: ["tile", "board"], description: "One tile isolated, or the recorded 72-tile board", ...board },
    plan: { control: "select", options: BIRD_PLANS, description: "The tile of the 'tile' layout", ...board },
    forest: { control: "boolean", description: "Every plan on its Forest variants (their own perches)", ...board },
    view: { control: "inline-radio", options: ["game", "phone-play", "close"], description: `The game's opening camera, a phone's play distance (${PHONE_PLAY_DISTANCE}), or close on the tile`, ...board },
    distance: { ...range(8, 300, 1), description: "Camera distance; unset, the view's own", ...board },
    time: { control: "inline-radio", options: ["cycle", "day", "night"], description: "The day and night cycle running, or held at a day or a night", ...board },
    cycleSeconds: { ...range(10, 240, 5), description: "One day and night, seconds (120 in the game)", ...board },
    enabled: { control: "boolean", description: "The ambient effects on (the loop runs)", ...board },
    quality: { control: "inline-radio", options: ["auto", ...QUALITY_TIERS], description: "Low turns the ambient effects off", ...board },
  },
  args: {
    ...d,
    fps: AMBIENT_FPS,
    perches: false,
    layout: "board",
    plan: "rfffrfffr",
    forest: false,
    view: "phone-play",
    time: "day",
    cycleSeconds: 120,
    enabled: true,
    quality: "medium",
  },
} satisfies Meta<typeof BirdsBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The recorded board at a phone's play distance, held at a day: the defaults as they would play. */
export const Board: Story = {};

/** The recorded board at the game's opening camera, the day and night cycle running: no flight at night. */
export const BoardCycle: Story = { args: { view: "game", time: "cycle" } };

/** Held at a night: the birds roost, nothing flies. */
export const BoardAtNight: Story = { args: { time: "night" } };

/** One tile, close, its perches shown: choose a plan to check its tree tops. */
export const Perches: Story = { args: { layout: "tile", view: "close", perches: true, intervalSeconds: 4 } };

/** The Forest variants' perches, on one tile. */
export const ForestPerches: Story = { args: { layout: "tile", view: "close", perches: true, forest: true, plan: "ffffffcff", intervalSeconds: 4 } };

/** Flocks only, more often, to judge the boids. */
export const Flocks: Story = { args: { flockShare: 1, flockSize: 7, intervalSeconds: 5 } };

/** One bird at a time, often, close, to judge the flight and the wingbeat. */
export const SingleClose: Story = { args: { flockShare: 0, intervalSeconds: 3, layout: "tile", plan: "rfrfffffr", view: "close" } };

/** The birds casting shadows. */
export const Shadows: Story = { args: { shadows: true, intervalSeconds: 5 } };

/** The Low tier: the ambient effects are off there, nothing flies. */
export const LowTier: Story = { args: { quality: "low" } };
