import type { Meta, StoryObj } from "@storybook/react-vite";
import { DAY_PHASES, DEFAULT_WINDOW_LIGHT, QUALITY_TIERS, SEASONS, WINDOW_DETECTIONS } from "@paved/renderer";
import { NightWindowsBoard } from "./night-windows-board";
import { VIEWS } from "./outlines-tour";

/**
 * The night windows on the board (NIGHT-WINDOWS, #513; NIGHT-WINDOWS-2, #571; NIGHT-WINDOWS-DEFAULT, #583): the recorded 72-tile
 * board with its night lights, the buildings' windows and doors (`DEFAULT_DAYNIGHT_SETTINGS`, the board's default). The second
 * pass's detection finds the windows of the towers and the houses on every wall and the doors on the ground; the light is the
 * first pass's (strength 0.4, reach 6, falloff 1.5), and goes past the tile's border onto the neighbours' ground as far as it
 * reaches. Every window is on by full night. The knobs are `dayNight.windowLight`.
 *
 * Software WebGL (the captures' renderer on a machine with no GPU) is marked in the PR: it shows layout and colour, never a
 * frame time.
 */
const meta = {
  title: "Renderer/Night windows board",
  component: NightWindowsBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    layout: { control: "inline-radio", options: ["single", "moments"], description: "One scene, or the windows at four moments of the evening" },
    phase: { control: "inline-radio", options: ["running", ...DAY_PHASES], description: "Held at dusk or night, or running through the ramp" },
    season: { control: "inline-radio", options: ["random", ...SEASONS] },
    speed: { control: "inline-radio", options: [1, 10], description: "x10: a whole cycle in 12 s, the ramp's stagger visible" },
    view: { control: "select", options: VIEWS, description: "The game's views" },
    distance: { control: { type: "range", min: 8, max: 300, step: 1 }, description: "Camera distance; unset, the view's own" },
    windowIntensity: { control: { type: "range", min: 0, max: 4, step: 0.05 }, description: `The windows' strength (default ${DEFAULT_WINDOW_LIGHT.intensity})` },
    reach: { control: { type: "range", min: 1, max: 20, step: 0.5 }, description: `The windows' reach in voxels (default ${DEFAULT_WINDOW_LIGHT.reach})` },
    falloff: { control: { type: "range", min: 0.5, max: 4, step: 0.1 }, description: `The falloff's exponent (default ${DEFAULT_WINDOW_LIGHT.falloff})` },
    margin: { control: { type: "range", min: 0, max: 16, step: 1 }, description: `Past the tile's border, in voxels (default ${DEFAULT_WINDOW_LIGHT.margin}; 0: stops at the border)` },
    stagger: { control: { type: "range", min: 0.1, max: 2, step: 0.05 }, description: `The spread of the switch-on levels (default ${DEFAULT_WINDOW_LIGHT.stagger}: every window on by full night)` },
    detection: { control: "inline-radio", options: WINDOW_DETECTIONS, description: "Which windows are found: through the walls into rooms (#571), or recesses only (#513)" },
    quality: { control: "inline-radio", options: ["auto", ...QUALITY_TIERS], description: "Low is a still noon: no night lights" },
    force: { control: "inline-radio", options: ["auto", "on", "off"] },
    forest: { control: "boolean", description: "Every plan on its Forest variants" },
  },
  args: {
    layout: "single",
    phase: "night",
    season: "summer",
    speed: 1,
    view: "default",
    windowIntensity: DEFAULT_WINDOW_LIGHT.intensity,
    reach: DEFAULT_WINDOW_LIGHT.reach,
    falloff: DEFAULT_WINDOW_LIGHT.falloff,
    margin: DEFAULT_WINDOW_LIGHT.margin,
    stagger: DEFAULT_WINDOW_LIGHT.stagger,
    detection: DEFAULT_WINDOW_LIGHT.detection,
    quality: "medium",
    force: "auto",
    forest: false,
  },
} satisfies Meta<typeof NightWindowsBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The board at a held night, with its default night lights. */
export const Night: Story = {};

/** The board at a held dusk: the first lights. */
export const Dusk: Story = { args: { phase: "dusk", season: "autumn" } };

/** The stagger at four moments of the evening: some windows still dark at dusk, every window on at night. */
export const Moments: Story = { args: { layout: "moments" } };

/** The ramp: a cycle in 12 s, so the windows light one by one with their pools of light as the night comes. */
export const Ramp: Story = { args: { phase: "running", speed: 10 } };

/** The zoomed-in view, where a window or a door and the pool of light in front of it, past the border, read. */
export const ZoomedIn: Story = { args: { view: "zoomed-in" } };

/** The phone's Low tier is a still noon: no night lights, no volume built. */
export const LowTier: Story = { args: { quality: "low" } };

/** Every plan on its Forest variants. */
export const Forest: Story = { args: { forest: true } };
