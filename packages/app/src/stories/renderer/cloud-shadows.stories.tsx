import type { Meta, StoryObj } from "@storybook/react-vite";
import { AMBIENT_FPS, DEFAULT_CLOUD_SHADOWS, QUALITY_TIERS, SEASONS } from "@paved/renderer";
import { CloudShadowsBoard, OPENING_TILT, PHONE_PLAY_DISTANCE, STEEPEST_TILT } from "./cloud-shadows-board";

const d = DEFAULT_CLOUD_SHADOWS;

/**
 * The cloud shadows (CLOUD-SHADOWS, #573): clouds pass in front of the sun, continuously, and cast light shadows on the board.
 * Subtle, the owner's word: a soft shade of a fifth of the sun's direct light drifts across the tiles, never the sky's or the
 * ambient light. No cloud is drawn between the camera and the board (it would hide it): "Wisps" shows faint ones at the
 * steepest tilt, for the owner to judge.
 *
 * The clouds are a term of the light in the tile shader, from a small noise map made once: no shadow-map pass, no extra draw
 * (the wisps add one). They drift on the one ambient loop (capped at 30 steps a second; a frame is drawn once they moved a
 * quarter of a voxel, about 15 a second at the default wind) and stop with the 'Ambient effects' setting, the Low tier and
 * reduced motion. They follow the sun; at night they are off (the proposal), "moon" darkens the moon's light too. With the
 * cycle on, the coverage changes with the season (the proposal: x0.8 in summer, x1.2 in autumn, x1.3 in winter).
 *
 * The readout names the renderer: on software WebGL its frame time is not a measure.
 */
const meta = {
  title: "Renderer/Cloud shadows",
  component: CloudShadowsBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    enabled: { control: "boolean", description: "The 'Ambient effects' setting" },
    coverage: { control: { type: "range", min: 0, max: 1, step: 0.01 }, description: `The share of the board under a cloud (default ${d.coverage})` },
    scale: { control: { type: "range", min: 6, max: 160, step: 1 }, description: `World units one period of the clouds spans; a tile is 3 (default ${d.scale})` },
    softness: { control: { type: "range", min: 0, max: 1, step: 0.01 }, description: `The soft edge's width, a share of the board (default ${d.softness})` },
    darkness: { control: { type: "range", min: 0, max: 1, step: 0.01 }, description: `The share of the sun's light a cloud takes (default ${d.darkness}; the brief: 0.15 to 0.25)` },
    windDirection: { control: { type: "range", min: 0, max: 360, step: 5 }, description: `Where the wind blows toward, degrees (default ${d.windDirection})` },
    windSpeed: { control: { type: "range", min: 0, max: 6, step: 0.05 }, description: `World units a second (default ${d.windSpeed}: a tile in six seconds)` },
    height: { control: { type: "range", min: 2, max: 80, step: 1 }, description: `The clouds' height over the board (default ${d.height})` },
    moon: { control: { type: "range", min: 0, max: 1, step: 0.05 }, description: `At night, the share of the darkness on the moon's light (default ${d.moon}: off at night)` },
    wisps: { control: { type: "range", min: 0, max: 0.6, step: 0.01 }, description: `Visible wisps over the board, their opacity (default ${d.wisps}: none)` },
    seasonal: { control: "boolean", description: "The season's coverage factor while the cycle runs (the proposal)" },
    cycle: { control: "inline-radio", options: ["off", "running", "day", "dusk", "night"], description: "The day and night cycle: off (the look's sun), running (x10), or held" },
    season: { control: "inline-radio", options: SEASONS, description: "The season the cycle starts from or holds at" },
    tilt: { control: { type: "range", min: 0, max: STEEPEST_TILT, step: 1 }, description: `The camera's tilt, degrees: ${OPENING_TILT} the game's (locked), ${STEEPEST_TILT} the former steepest` },
    distance: { control: { type: "range", min: 40, max: 300, step: 1 }, description: `Camera distance: ${PHONE_PLAY_DISTANCE} a phone's play distance` },
    fps: { control: { type: "range", min: 5, max: 60, step: 1 }, description: `The ambient loop's rate cap (default ${AMBIENT_FPS})` },
    quality: { control: "inline-radio", options: ["auto", ...QUALITY_TIERS], description: "Low turns the effects off" },
  },
  args: {
    enabled: true,
    coverage: d.coverage,
    scale: d.scale,
    softness: d.softness,
    darkness: d.darkness,
    windDirection: d.windDirection,
    windSpeed: d.windSpeed,
    height: d.height,
    moon: d.moon,
    wisps: d.wisps,
    seasonal: true,
    cycle: "off",
    season: "summer",
    tilt: OPENING_TILT,
    distance: PHONE_PLAY_DISTANCE,
    fps: AMBIENT_FPS,
    quality: "medium",
  },
} satisfies Meta<typeof CloudShadowsBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The recorded board at the game's camera, a phone's play distance, the cycle off: the defaults as the board draws them. */
export const Board: Story = {};

/** The cycle running (ten times as fast): the clouds follow the sun, and go with it at night. */
export const WithCycle: Story = { args: { cycle: "running" } };

/** Held at night with the moon's share at 0.5: the proposal's alternative, faint clouds on the moon's light. */
export const NightOnTheMoon: Story = { args: { cycle: "night", moon: 0.5 } };

/** Held at an autumn noon: the season's coverage (x1.2). */
export const Autumn: Story = { args: { cycle: "day", season: "autumn" } };

/** Faint wisps between the camera and the board, at the former steepest tilt: for the owner to judge (none by default). */
export const Wisps: Story = { args: { wisps: 0.06, tilt: STEEPEST_TILT } };

/** Stronger and faster, to see the shapes and the motion (not a proposal). */
export const Exaggerated: Story = { args: { darkness: 0.5, windSpeed: 3 } };

/** The setting off: nothing moves, the board draws only when something changes. */
export const Off: Story = { args: { enabled: false } };

/** The Low tier: the effects are off there, whatever the setting says. */
export const LowTier: Story = { args: { quality: "low" } };
