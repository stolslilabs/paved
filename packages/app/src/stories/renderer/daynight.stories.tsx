import type { Meta, StoryObj } from "@storybook/react-vite";
import { DAY_PHASES, QUALITY_TIERS, SEASONS } from "@paved/renderer";
import { DayNightBoard } from "./daynight-board";
import { MAX_DISTANCE, MIN_DISTANCE, VIEWS } from "./outlines-tour";

/**
 * The day and night cycle (DAYNIGHT, P-73) on the recorded 72-tile board. A two-minute cycle runs one day and one night of
 * one season (about 75 s of day with its dawn and dusk, then 45 s of night), then the next season. Behind the board is a
 * gradient of the season's colours, blended in OKLab. The sun crosses from east to west and the shadows turn with it; the
 * moon lights the night. The city voxels and the buildings along the roads light up one by one as night falls. Every
 * control is the renderer's `dayNight` setting; the game turns it on from Settings ("Day/night cycle").
 */
const meta = {
  title: "Renderer/DayNight",
  component: DayNightBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    cycleSeconds: { control: { type: "range", min: 10, max: 600, step: 10 }, description: "One cycle (a day and a night), seconds: 120 in the game" },
    phase: { control: "inline-radio", options: ["running", ...DAY_PHASES], description: "Hold the cycle at a phase, or let it run" },
    season: { control: "inline-radio", options: ["random", ...SEASONS], description: "The season it starts from or holds at (random: one per page)" },
    speed: { control: "inline-radio", options: [1, 10], description: "x1: real time; x10: a cycle in 12 s" },
    nightLights: { control: "boolean", description: "The city and road lights at night" },
    nightLightIntensity: { control: { type: "range", min: 0, max: 2, step: 0.05 }, description: "The night lights' strength (default 0.4)" },
    brightnessFloor: { control: { type: "range", min: 0, max: 1, step: 0.05 }, description: "The night's floor: the sky light at least this share of the day's (default 0.6)" },
    reducedMotion: { control: "boolean", description: "Reduced motion: a still day (unset: the device's)" },
    quality: { control: "inline-radio", options: ["auto", ...QUALITY_TIERS], description: "Graphics quality: Low is a still day too" },
    view: { control: "select", options: VIEWS, description: "The camera's view (default: the game's opening view)" },
    distance: { control: { type: "range", min: MIN_DISTANCE, max: MAX_DISTANCE, step: 1 }, description: "Camera distance; unset, the view's own" },
    redraw: { control: "boolean", description: "Draw every frame even when nothing moves (frame-time measures)" },
    readout: { control: "boolean", description: "Show the season, the phase and the place in the cycle" },
    force: { control: "inline-radio", options: ["auto", "on", "off"], description: "Outlines: auto turns them off on software WebGL" },
    placement: { control: "inline-radio", options: ["none", "slots", "placed"], description: "The placement visuals over the cycle: a tile in hand, or placed" },
  },
  args: { cycleSeconds: 120, phase: "running", season: "random", speed: 1, nightLights: true, quality: "auto", view: "default", redraw: false, readout: true, force: "auto", placement: "none" },
} satisfies Meta<typeof DayNightBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The cycle as the game runs it: two minutes, a random season to start. */
export const Cycle: Story = {};

/** Ten times as fast: a whole day and night in 12 s, a year in 48 s. */
export const Fast: Story = { args: { speed: 10 } };

/** Held at a summer noon. */
export const SummerDay: Story = { args: { phase: "day", season: "summer" } };

/** Held at a summer night: the cities and the road's buildings lit. */
export const SummerNight: Story = { args: { phase: "night", season: "summer" } };

/** Held at an autumn dusk. */
export const AutumnDusk: Story = { args: { phase: "dusk", season: "autumn" } };

/** Held at a winter dawn. */
export const WinterDawn: Story = { args: { phase: "dawn", season: "winter" } };

/** A night with the lights off: the moon and the floor alone. */
export const NightNoLights: Story = { args: { phase: "night", season: "spring", nightLights: false } };

/** Reduced motion: a still day of the start season, no moving shadow. */
export const ReducedMotion: Story = { args: { reducedMotion: true } };

/** A tile in hand at a night: its slots and neon over the dark backdrop. */
export const SlotsAtNight: Story = { args: { phase: "night", season: "autumn", placement: "slots" } };

/** A tile placed on a slot at an autumn dusk: its aura and veil over the warm light. */
export const PlacedAtDusk: Story = { args: { phase: "dusk", season: "autumn", placement: "placed" } };
