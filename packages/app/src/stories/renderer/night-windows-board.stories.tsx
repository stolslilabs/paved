import type { Meta, StoryObj } from "@storybook/react-vite";
import { DAY_PHASES, QUALITY_TIERS, SEASONS } from "@paved/renderer";
import { NightWindowsBoard } from "./night-windows-board";
import { VIEWS } from "./outlines-tour";

/**
 * The night windows on the board (NIGHT-WINDOWS, #513, item 3): the recorded 72-tile board with today's night lights
 * ("columns") against the windows' ("windows"). Software WebGL (the captures' renderer here) is marked in the PR: it shows layout
 * and colour, never a frame time.
 */
const meta = {
  title: "Renderer/Night windows board",
  component: NightWindowsBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    layout: { control: "inline-radio", options: ["side-by-side", "single"], description: "Both sources side by side, or one at a time" },
    lights: { control: "inline-radio", options: ["columns", "windows"], description: "The source shown when single: the toggle" },
    phase: { control: "inline-radio", options: ["running", ...DAY_PHASES], description: "Held at dusk or night, or running through the ramp" },
    season: { control: "inline-radio", options: ["random", ...SEASONS] },
    speed: { control: "inline-radio", options: [1, 10], description: "x10: a whole cycle in 12 s, the ramp's stagger visible" },
    view: { control: "select", options: VIEWS, description: "The game's views" },
    distance: { control: { type: "range", min: 8, max: 300, step: 1 }, description: "Camera distance; unset, the view's own" },
    nightLightIntensity: { control: { type: "range", min: 0, max: 2, step: 0.05 }, description: "The night lights' strength (default 0.4)" },
    quality: { control: "inline-radio", options: ["auto", ...QUALITY_TIERS], description: "Low is a still noon: no night lights" },
    force: { control: "inline-radio", options: ["auto", "on", "off"] },
    forest: { control: "boolean", description: "Every plan on its Forest variants" },
  },
  args: { layout: "side-by-side", lights: "windows", phase: "night", season: "summer", speed: 1, view: "default", nightLightIntensity: 0.4, quality: "medium", force: "auto", forest: false },
} satisfies Meta<typeof NightWindowsBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Both at a held night, side by side: the same clock, season and view. */
export const SideBySideNight: Story = {};

/** Both at a held dusk: the first lights. */
export const SideBySideDusk: Story = { args: { phase: "dusk", season: "autumn" } };

/** One scene with the toggle (`lights`), at the game's default view. */
export const Toggle: Story = { args: { layout: "single", lights: "windows" } };

/** Today's lights alone, for the toggle's other side. */
export const ToggleColumns: Story = { args: { layout: "single", lights: "columns" } };

/** The ramp: a cycle in 12 s, so the windows light one by one with their pools of light as the night comes. */
export const Ramp: Story = { args: { layout: "single", lights: "windows", phase: "running", speed: 10 } };

/** The zoomed-in view, where a window and the pool of light in front of it read. */
export const ZoomedIn: Story = { args: { view: "zoomed-in", layout: "side-by-side" } };

/** The phone's Low tier is a still noon: no night lights, no volume built. */
export const LowTier: Story = { args: { quality: "low", layout: "single" } };

/** Every plan on its Forest variants. */
export const Forest: Story = { args: { forest: true } };
