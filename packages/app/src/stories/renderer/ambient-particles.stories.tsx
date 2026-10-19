import type { Meta, StoryObj } from "@storybook/react-vite";
import { AMBIENT_FPS, DEFAULT_AMBIENT_PARTICLES, QUALITY_TIERS } from "@paved/renderer";
import { AmbientParticlesBoard, EMITTING_PLANS } from "./ambient-particles-board";
import { VIEWS } from "./outlines-tour";

const d = DEFAULT_AMBIENT_PARTICLES;

/**
 * The ambient particles (AMBIENT-PARTICLES, #572): sparse motes rising over the water ("magic water") and a few slow sparkles over
 * the wonders. The owner's word is subtle: almost unnoticed, they only give the board some motion. One draw per kind for the whole
 * board, the motion in the vertex shader from the one ambient loop's time (capped at 30 fps, stopped while the tab is hidden or
 * the board covered), the particles fading out as the camera zooms out with the outlines' curve. The night glow is a proposal for
 * the owner: "Night" holds the board at night to judge it.
 *
 * The size, speed, rise, drift and opacity controls multiply each kind's default; the counts are the settings themselves. The
 * readout names the renderer: on software WebGL its frame time is not a measure.
 */
const meta = {
  title: "Renderer/Ambient particles",
  component: AmbientParticlesBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    layout: { control: "inline-radio", options: ["tile", "all-tiles", "board"], description: "One tile isolated, the 19 plans side by side, or the recorded 72-tile board" },
    plan: { control: "select", options: EMITTING_PLANS, description: "The tile of the 'tile' layout: the plans with water, then the two wonders" },
    view: { control: "select", options: ["game", "phone-play", ...VIEWS], description: "The game's opening camera, a phone's play distance (160), or a tour view" },
    distance: { control: { type: "range", min: 8, max: 300, step: 1 }, description: "Camera distance; unset, the view's own" },
    enabled: { control: "boolean", description: "The 'Ambient effects' setting" },
    waterDensity: { control: { type: "range", min: 0, max: 1, step: 0.01 }, description: `Motes per water top voxel (default ${d.water.density})` },
    waterPerTile: { control: { type: "range", min: 0, max: 40, step: 1 }, description: `At most per tile (default ${d.water.perTile})` },
    wonderDensity: { control: { type: "range", min: 0, max: 0.2, step: 0.005 }, description: `Sparkles per wonder top voxel (default ${d.wonder.density})` },
    wonderPerTile: { control: { type: "range", min: 0, max: 40, step: 1 }, description: `At most per tile (default ${d.wonder.perTile})` },
    boardCap: { control: { type: "range", min: 0, max: 2000, step: 10 }, description: `At most per kind on the board (default ${d.boardCap})` },
    size: { control: { type: "range", min: 0.25, max: 4, step: 0.05 }, description: `x the default size (water ${d.water.size}, wonder ${d.wonder.size} world units)` },
    minPixels: { control: { type: "range", min: 0, max: 16, step: 0.5 }, description: `The smallest a particle is drawn, CSS px (default ${d.minPixels})` },
    maxPixels: { control: { type: "range", min: 1, max: 64, step: 1 }, description: `The largest, CSS px (default ${d.maxPixels})` },
    speed: { control: { type: "range", min: 0.25, max: 4, step: 0.05 }, description: `x the default pace (lives of ${d.water.lifeSeconds} s and ${d.wonder.lifeSeconds} s)` },
    rise: { control: { type: "range", min: 0, max: 4, step: 0.05 }, description: `x the default rise (${d.water.rise} and ${d.wonder.rise} units)` },
    drift: { control: { type: "range", min: 0, max: 4, step: 0.05 }, description: `x the default drift (${d.water.drift} and ${d.wonder.drift} units)` },
    opacity: { control: { type: "range", min: 0, max: 3, step: 0.05 }, description: `x the default opacity (${d.water.opacity} and ${d.wonder.opacity})` },
    waterColor: { control: "color" },
    wonderColor: { control: "color" },
    nightGlow: { control: { type: "range", min: 0, max: 3, step: 0.05 }, description: `The night glow (a proposal; default ${d.nightGlow}: up to x${1 + d.nightGlow} light at full night)` },
    night: { control: "boolean", description: "Hold the board at night (the day and night cycle frozen there) to judge the glow" },
    zoomFade: { control: "boolean", description: "Fade out as the camera zooms out, with the outlines' curve" },
    fps: { control: { type: "range", min: 5, max: 60, step: 1 }, description: `The ambient loop's rate cap (default ${AMBIENT_FPS})` },
    quality: { control: "inline-radio", options: ["auto", ...QUALITY_TIERS], description: "Low turns the effects off" },
    forest: { control: "boolean", description: "Every plan on its Forest variants" },
  },
  args: {
    layout: "board",
    plan: "rfffrfcfr",
    view: "phone-play",
    enabled: true,
    waterDensity: d.water.density,
    waterPerTile: d.water.perTile,
    wonderDensity: d.wonder.density,
    wonderPerTile: d.wonder.perTile,
    boardCap: d.boardCap,
    size: 1,
    minPixels: d.minPixels,
    maxPixels: d.maxPixels,
    speed: 1,
    rise: 1,
    drift: 1,
    opacity: 1,
    waterColor: d.water.color,
    wonderColor: d.wonder.color,
    nightGlow: d.nightGlow,
    night: false,
    zoomFade: true,
    fps: AMBIENT_FPS,
    quality: "medium",
    forest: false,
  },
} satisfies Meta<typeof AmbientParticlesBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The recorded board at a phone's play distance: the defaults as the board draws them. */
export const Board: Story = {};

/** The recorded board at the game's opening camera: the particles are fading out there, as the outlines are. */
export const BoardAtOpening: Story = { args: { view: "game" } };

/** The board at night: the night glow (the proposal). */
export const BoardAtNight: Story = { args: { night: true } };

/** One river tile isolated, close: the motes rising over the water. */
export const WaterTile: Story = { args: { layout: "tile", plan: "rfffrfcfr", view: "zoomed-in" } };

/** One wonder isolated, close: the slow sparkles. */
export const WonderTile: Story = { args: { layout: "tile", plan: "wfffffffr", view: "zoomed-in" } };

/** The 19 plans side by side: only the water and the wonders emit. */
export const AllTiles: Story = { args: { layout: "all-tiles", view: "top" } };

/** Every plan on its Forest variants: their palette's water and wonders. */
export const Forest: Story = { args: { forest: true } };

/** The setting off: nothing moves, the board draws only when something changes. */
export const Off: Story = { args: { enabled: false } };
