import type { Meta, StoryObj } from "@storybook/react-vite";
import { NIGHT_WINDOW_PLANS, NightWindowsTable, NightWindowsTile } from "./night-windows-tile";

/**
 * The night windows (NIGHT-WINDOWS, #513): the buildings' windows found in the model's voxels, and the light they cast, baked
 * per model type. This is where the owner judges the look before it replaces anything: the board keeps today's "columns" night
 * lights (`dayNight.lights`, default "columns"); "windows" is set by these stories only.
 *
 * Each tile is drawn on a 2D canvas (isometric, turn it with `rotation`), so it reads the same on any WebGL, software included.
 * 1. "WindowsFound": each of the 19 plans (and its Forest variants, through the skin), the detected windows boxed in cyan, doors
 *    in magenta, the openings that are neither (gaps) in grey, and the candidates the lit columns drop in orange; the counts.
 * 2. "LightVolume": the same tile at night, step by step: the windows glowing alone, then the light volume, with the falloff, the
 *    reach, the intensity, the flood or the rays, and slices of the volume.
 * 3. "Board…": the recorded board at a held dusk or night, "columns" against "windows", side by side or with a toggle, at the game's
 *    views, or running through the ramp so the windows' stagger shows. A capture on software WebGL is not a frame time.
 * 4. "Readout": the windows per model, the volume's size and the build times in this browser.
 */
const meta = {
  title: "Renderer/Night windows",
  component: NightWindowsTile,
  parameters: { layout: "fullscreen" },
  argTypes: {
    plan: { control: "select", options: NIGHT_WINDOW_PLANS, description: "The plan whose model is analysed" },
    skin: { control: "inline-radio", options: ["base", "forest"], description: "The base model, or its Forest variant through the skin" },
    variant: { control: { type: "range", min: 1, max: 4, step: 1 }, description: "Which Forest variant (clamped to what the plan has)" },
    rotation: { control: { type: "range", min: 0, max: 3, step: 1 }, description: "Quarter turns of the view" },
    step: { control: "inline-radio", options: ["found", "glow", "volume", "slice"], description: "Windows found; windows glowing alone; the light volume; the volume with a slice" },
    marks: { control: "check", options: ["window", "door", "gap", "unlit"], description: "Which openings are boxed" },
    method: { control: "inline-radio", options: ["flood", "rays"], description: "How the light is cast into the air in front of a window" },
    reach: { control: { type: "range", min: 1, max: 16, step: 0.5 }, description: "How far the light reaches, in voxels" },
    falloff: { control: { type: "range", min: 0.5, max: 4, step: 0.1 }, description: "The falloff's exponent" },
    intensity: { control: { type: "range", min: 0, max: 2, step: 0.05 }, description: "The light's strength" },
    lightColor: { control: "color", description: "The light's colour (the game's amber)" },
    doorsLight: { control: "boolean", description: "A door casts light too" },
    layer: { control: { type: "range", min: 0, max: 34, step: 1 }, description: "The layer of the slice" },
    night: { control: "boolean", description: "Night colours under the marks (always on past the first step)" },
  },
  args: {
    plan: "ccccccccc",
    skin: "base",
    variant: 1,
    rotation: 0,
    step: "found",
    marks: ["window", "door", "gap", "unlit"],
    method: "flood",
    reach: 6,
    falloff: 1.5,
    intensity: 1,
    lightColor: "#ffb57a",
    doorsLight: true,
    layer: 6,
    night: false,
  },
} satisfies Meta<typeof NightWindowsTile>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 1. The windows found in one tile: pick a plan, turn the view, switch the marks. */
export const WindowsFound: Story = {};

/** The plan with the most windows (11), seen from the other side. */
export const MostWindows: Story = { args: { plan: "ffcfffcff", rotation: 2 } };

/** The strips (4 x 1) and the wide windows (2 x 1) of the road houses. */
export const Strips: Story = { args: { plan: "rfrfrfcff", rotation: 1 } };

/** The same plan through the Forest skin: the variant's windows. */
export const ForestVariant: Story = { args: { plan: "cccccfffc", skin: "forest", variant: 2 } };

/** 2a. The windows glowing alone, at night. */
export const WindowsGlow: Story = { args: { step: "glow", marks: [] } };

/** 2b. The light volume: the windows and the pools of light on the ground and the walls in front of them. */
export const LightVolume: Story = { args: { step: "volume", marks: [] } };

/** 2c. The same with rays instead of the flood: sharper beams out of the openings. */
export const LightVolumeRays: Story = { args: { step: "volume", marks: [], method: "rays" } };

/** 2d. A slice of the volume beside the tile, for debugging: the layer's light on its 40 x 40 cells. */
export const VolumeSlice: Story = { args: { step: "slice", marks: ["window"], layer: 6, plan: "ffcfffcff" } };

/** 3. The readout: windows per model, the volume's size and the build time of each step in this browser (the 19 base models). */
export const Readout: Story = { render: () => <NightWindowsTable skin="base" /> };

/** The same for the Forest variants, through the skin. */
export const ReadoutForest: Story = { render: () => <NightWindowsTable skin="forest" /> };
