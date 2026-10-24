import type { Meta, StoryObj } from "@storybook/react-vite";
import { QUALITY_TIERS } from "@paved/renderer";
import { CLOSING_ARGS, CLOSING_SCENARIOS, ClosingBoard } from "./closing-board";

/**
 * The closed structures (CLOSE-SHINE, #722): when a move closes a structure, its voxels pulse a bright yellow as its line
 * appears in the closing feed (0.15 s apart when one move closes several), then a band of light sweeps across it every few
 * seconds for the rest of the game, each structure on its own clock. The look of animate-ui's Shine (a band slanted at -15
 * degrees, 1.2 s, `cubic-bezier(0.4, 0, 0.2, 1)`, 0.3), the renderer's own. Every setting is a control: the tuning is
 * proposed here. Between sweeps the board draws no frame. Reduced motion: a short tint and no shine; the Low tier and
 * software WebGL: no shine.
 */
const meta = {
  title: "Renderer/Closing",
  component: ClosingBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    scenario: {
      control: "inline-radio",
      options: CLOSING_SCENARIOS,
      type: { name: "enum", value: [...CLOSING_SCENARIOS] },
      description: "stagger: Play closes a road, a forest, a city and a road at once; many: 17 closed structures, each on its own clock",
    },
    quality: {
      control: "inline-radio",
      options: ["auto", ...QUALITY_TIERS],
      type: { name: "enum", value: ["auto", ...QUALITY_TIERS] },
      description: "Graphics quality: low draws no shine",
    },
    reducedMotion: { control: "boolean", description: "Reduced motion (the confirm's rule): a short tint, no shine" },
    pulseColor: { control: "color", description: "The pulse's colour (FEATURE-HL's yellow)" },
    pulseStrength: { control: { type: "range", min: 0, max: 1, step: 0.05 }, description: "How far the voxels go to the colour at the peak (the confirm's 0.6)" },
    pulseGlow: { control: { type: "range", min: 0, max: 2, step: 0.05 }, description: "The light the pulse adds at its peak" },
    pulseMs: { control: { type: "range", min: 100, max: 2000, step: 50 }, description: "The pulse's length, ms (the confirm's 700)" },
    reducedPulseMs: { control: { type: "range", min: 50, max: 500, step: 10 }, description: "Its length under reduced motion, ms (150)" },
    staggerMs: { control: { type: "range", min: 0, max: 600, step: 10 }, description: "Between the pulses of one move's structures, ms (the feed's 150)" },
    shine: { control: "boolean", description: "The sweep, on or off" },
    shineColor: { control: "color", description: "The band's light" },
    shineStrength: { control: { type: "range", min: 0, max: 1.5, step: 0.05 }, description: "The band's light at its centre (the reference's 0.3)" },
    shineWidth: { control: { type: "range", min: 0.5, max: 12, step: 0.25 }, description: "The band's width, world units (a tile is 3)" },
    shineAngle: { control: { type: "range", min: -60, max: 60, step: 1 }, description: "The band's slant on screen, degrees (the reference's -15)" },
    shineDurationMs: { control: { type: "range", min: 300, max: 4000, step: 50 }, description: "One sweep, ms (1.2 s)" },
    intervalMinMs: { control: { type: "range", min: 1000, max: 20000, step: 250 }, description: "From one sweep's start to the next, at least, ms" },
    intervalMaxMs: { control: { type: "range", min: 1000, max: 20000, step: 250 }, description: "… and at most, ms: each structure picks its own" },
  },
  args: { scenario: "stagger", quality: "auto", reducedMotion: false, ...CLOSING_ARGS },
} satisfies Meta<typeof ClosingBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Play: one move closes a road, a forest, a city and a road; each pulses as its feed line appears, then shines. */
export const Stagger: Story = {};

/** Many closed structures, as a board loaded mid-game: no pulse, each sweeping on its own phase and interval. */
export const ManyStructures: Story = { args: { scenario: "many" } };

/** Reduced motion: Play gives a short tint (150 ms) on each structure, and no shine. */
export const ReducedMotion: Story = { args: { reducedMotion: true } };
