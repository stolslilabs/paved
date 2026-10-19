import type { Meta, StoryObj } from "@storybook/react-vite";
import { DAY_PHASES, DEFAULT_WINDOW_LIGHT, QUALITY_TIERS, SEASONS, WINDOW_RULES } from "@paved/renderer";
import { NightWindowsBoard } from "./night-windows-board";
import { VIEWS } from "./outlines-tour";

/**
 * The night windows on the board (NIGHT-WINDOWS, #513, item 3; second pass NIGHT-WINDOWS-2, #571): the recorded 72-tile board
 * with today's night lights ("columns") against the windows' ("windows"). The second pass finds the windows of the towers and
 * the houses on every wall, lights them stronger and further, past the tile's border onto the neighbours' ground, and every
 * window is on by full night. The knobs are the windows' own (`dayNight.windowLight`); the columns keep theirs.
 *
 * The proposal for the owner's next review (#571, item 4): the windows as the board's night lights. It is one line,
 * `lights: "columns"` in `DEFAULT_DAYNIGHT_SETTINGS` (`packages/renderer/src/core/daynight-settings.ts`) set to "windows"; this PR
 * leaves it at "columns". "Proposal" shows the board as it would be.
 *
 * Software WebGL (the captures' renderer on a machine with no GPU) is marked in the PR: it shows layout and colour, never a
 * frame time.
 */
const meta = {
  title: "Renderer/Night windows board",
  component: NightWindowsBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    layout: { control: "inline-radio", options: ["side-by-side", "single", "moments"], description: "Both sources side by side, one at a time, or the windows at four moments of the evening" },
    lights: { control: "inline-radio", options: ["columns", "windows"], description: "The source shown when single: the toggle" },
    phase: { control: "inline-radio", options: ["running", ...DAY_PHASES], description: "Held at dusk or night, or running through the ramp" },
    season: { control: "inline-radio", options: ["random", ...SEASONS] },
    speed: { control: "inline-radio", options: [1, 10], description: "x10: a whole cycle in 12 s, the ramp's stagger visible" },
    view: { control: "select", options: VIEWS, description: "The game's views" },
    distance: { control: { type: "range", min: 8, max: 300, step: 1 }, description: "Camera distance; unset, the view's own" },
    nightLightIntensity: { control: { type: "range", min: 0, max: 2, step: 0.05 }, description: "The columns' strength (default 0.4)" },
    windowIntensity: { control: { type: "range", min: 0, max: 4, step: 0.05 }, description: `The windows' strength (default ${DEFAULT_WINDOW_LIGHT.intensity}; the first pass used the columns' 0.4)` },
    reach: { control: { type: "range", min: 1, max: 20, step: 0.5 }, description: `The windows' reach in voxels (default ${DEFAULT_WINDOW_LIGHT.reach}; the first pass's 6)` },
    falloff: { control: { type: "range", min: 0.5, max: 4, step: 0.1 }, description: `The falloff's exponent (default ${DEFAULT_WINDOW_LIGHT.falloff}; the first pass's 1.5)` },
    margin: { control: { type: "range", min: 0, max: 16, step: 1 }, description: `Past the tile's border, in voxels (default ${DEFAULT_WINDOW_LIGHT.margin}; 0: stops at the border)` },
    stagger: { control: { type: "range", min: 0.1, max: 2, step: 0.05 }, description: `The spread of the switch-on levels (default ${DEFAULT_WINDOW_LIGHT.stagger}: every window on by full night)` },
    rule: { control: "inline-radio", options: WINDOW_RULES, description: "Which windows: every structure's (#571), or the lit columns' (#513)" },
    quality: { control: "inline-radio", options: ["auto", ...QUALITY_TIERS], description: "Low is a still noon: no night lights" },
    force: { control: "inline-radio", options: ["auto", "on", "off"] },
    forest: { control: "boolean", description: "Every plan on its Forest variants" },
  },
  args: {
    layout: "side-by-side",
    lights: "windows",
    phase: "night",
    season: "summer",
    speed: 1,
    view: "default",
    nightLightIntensity: 0.4,
    windowIntensity: DEFAULT_WINDOW_LIGHT.intensity,
    reach: DEFAULT_WINDOW_LIGHT.reach,
    falloff: DEFAULT_WINDOW_LIGHT.falloff,
    margin: DEFAULT_WINDOW_LIGHT.margin,
    stagger: DEFAULT_WINDOW_LIGHT.stagger,
    rule: DEFAULT_WINDOW_LIGHT.rule,
    quality: "medium",
    force: "auto",
    forest: false,
  },
} satisfies Meta<typeof NightWindowsBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Both at a held night, side by side: the same clock, season and view. */
export const SideBySideNight: Story = {};

/** Both at a held dusk: the first lights. */
export const SideBySideDusk: Story = { args: { phase: "dusk", season: "autumn" } };

/** The first pass's windows for comparison: the lit columns, reach 6, falloff 1.5, no margin, the columns' strength. */
export const FirstPass: Story = { args: { layout: "single", rule: "columns", reach: 6, falloff: 1.5, margin: 0, windowIntensity: 0.4, stagger: 1.6 / 0.85 } };

/** The proposal (#571, item 4): the windows as the board's night lights, one line in the defaults; shown at night. */
export const Proposal: Story = { args: { layout: "single", lights: "windows" } };

/** The proposal at dusk. */
export const ProposalDusk: Story = { args: { layout: "single", lights: "windows", phase: "dusk", season: "autumn" } };

/** The stagger at four moments of the evening: some windows still dark at dusk, every window on at night. */
export const Moments: Story = { args: { layout: "moments" } };

/** One scene with the toggle (`lights`), at the game's default view. */
export const Toggle: Story = { args: { layout: "single", lights: "windows" } };

/** Today's lights alone, for the toggle's other side. */
export const ToggleColumns: Story = { args: { layout: "single", lights: "columns" } };

/** The ramp: a cycle in 12 s, so the windows light one by one with their pools of light as the night comes. */
export const Ramp: Story = { args: { layout: "single", lights: "windows", phase: "running", speed: 10 } };

/** The zoomed-in view, where a window and the pool of light in front of it, past the border, read. */
export const ZoomedIn: Story = { args: { view: "zoomed-in", layout: "side-by-side" } };

/** The phone's Low tier is a still noon: no night lights, no volume built. */
export const LowTier: Story = { args: { quality: "low", layout: "single" } };

/** Every plan on its Forest variants. */
export const Forest: Story = { args: { forest: true } };
