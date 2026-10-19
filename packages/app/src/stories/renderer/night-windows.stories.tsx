import type { Meta, StoryObj } from "@storybook/react-vite";
import { DEFAULT_WINDOW_LIGHT } from "@paved/renderer";
import { NIGHT_WINDOW_PLANS, NightWindowsTable, NightWindowsTile } from "./night-windows-tile";

/**
 * The night windows (NIGHT-WINDOWS, #513; second pass NIGHT-WINDOWS-2, #571): the buildings' windows found in the model's voxels,
 * and the light they cast, baked per model type. This is where the owner judges the look before it replaces anything: the board
 * keeps today's "columns" night lights (`dayNight.lights`, default "columns"); "windows" is set by these stories only.
 *
 * The second pass: the houses and the towers are hollow, their walls one voxel thick, so their windows are holes through the
 * wall into a room; they are found now (the first pass took only recesses), on every wall. The rule that keeps them is the
 * structures' (every building, but the pockets in leaves, dropped as "vegetation"); the first pass's lit columns (a building
 * within 2 columns of a road) is the `rule` "columns". The windows of one room share its switch-on, so a tower's four light
 * together. The light reaches further, is stronger, and goes past the tile's border (`margin`, drawn on the ground round it).
 *
 * Each tile is drawn on a 2D canvas (isometric, turn it with `rotation`), so it reads the same on any WebGL, software included.
 * 1. "WindowsFound": each of the 19 plans (and its Forest variants, through the skin), the detected windows boxed in cyan, doors
 *    in magenta, the openings that are neither (gaps) in grey, and the candidates the rule drops in orange; the counts, and per
 *    structure (numbered on the view) its windows per wall, kept or dropped with the reason, and lit at night.
 * 2. "LightVolume": the same tile at night, step by step: the windows glowing alone, then the light volume, with the falloff, the
 *    reach, the margin, the intensity, the flood or the rays, and slices of the volume. `nightLevel` and the cell show the stagger.
 * 3. "Readout": the windows per model, the volume's size and the build times in this browser.
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
    marks: { control: "check", options: ["window", "door", "gap", "unlit"], description: "Which openings are boxed (unlit: those the rule drops)" },
    rule: { control: "inline-radio", options: ["structures", "columns", "none"], description: "Which openings are kept: every structure's (#571), the lit columns (#513), or all" },
    method: { control: "inline-radio", options: ["flood", "rays"], description: "How the light is cast into the air in front of a window" },
    reach: { control: { type: "range", min: 1, max: 20, step: 0.5 }, description: `How far the light reaches, in voxels (default ${DEFAULT_WINDOW_LIGHT.reach}; the first pass's 6)` },
    falloff: { control: { type: "range", min: 0.5, max: 4, step: 0.1 }, description: `The falloff's exponent (default ${DEFAULT_WINDOW_LIGHT.falloff}; the first pass's 1.5)` },
    margin: { control: { type: "range", min: 0, max: 16, step: 1 }, description: `How far past the tile's border the light goes, in voxels (default ${DEFAULT_WINDOW_LIGHT.margin}; 0: it stops there)` },
    intensity: { control: { type: "range", min: 0, max: 3, step: 0.05 }, description: "The light's strength on this view" },
    lightColor: { control: "color", description: "The light's colour (the game's amber)" },
    doorsLight: { control: "boolean", description: "A door casts light too" },
    nightLevel: { control: { type: "range", min: 0, max: 1, step: 0.05 }, description: "The night's level the switch-on is read at: dusk is 0.6, the night 1" },
    stagger: { control: { type: "range", min: 0.1, max: 2, step: 0.05 }, description: `The spread of the switch-on levels (default ${DEFAULT_WINDOW_LIGHT.stagger}: every window on by full night)` },
    cellX: { control: { type: "range", min: -8, max: 8, step: 1 }, description: "The tile's cell (x): another cell lights other windows first" },
    cellY: { control: { type: "range", min: -8, max: 8, step: 1 }, description: "The tile's cell (y)" },
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
    rule: "structures",
    method: "flood",
    reach: DEFAULT_WINDOW_LIGHT.reach,
    falloff: DEFAULT_WINDOW_LIGHT.falloff,
    margin: DEFAULT_WINDOW_LIGHT.margin,
    intensity: DEFAULT_WINDOW_LIGHT.intensity,
    lightColor: "#ffb57a",
    doorsLight: true,
    nightLevel: 1,
    stagger: DEFAULT_WINDOW_LIGHT.stagger,
    cellX: 0,
    cellY: 0,
    layer: 6,
    night: false,
  },
} satisfies Meta<typeof NightWindowsTile>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 1. The windows found in one tile: pick a plan, turn the view, switch the marks and the rule. */
export const WindowsFound: Story = {};

/** The towers (#571): the city's towers, a window through each of their four walls, the four lit together (one room). */
export const Towers: Story = { args: { plan: "cccccfffc", rotation: 0 } };

/** The walls (#571): the city wall with its towers and its gatehouse; the plain stretches have no opening in the model. */
export const Walls: Story = { args: { plan: "ffcfffcff", rotation: 0 } };

/** A house (#571): the city's houses, hollow, a window on each wall; the first pass found one of four at most. */
export const House: Story = { args: { plan: "ccccccccc", rotation: 1 } };

/** The first pass's rule on the same houses: the lit columns (by a road) drop the field's houses, in orange. */
export const RuleColumns: Story = { args: { plan: "sfrfrfrfr", rule: "columns" } };

/** The plan with the most windows, seen from the other side. */
export const MostWindows: Story = { args: { plan: "cccccfrfc", rotation: 2 } };

/** The strips (4 x 1) and the wide windows (2 x 1) of the road houses. */
export const Strips: Story = { args: { plan: "rfrfrfcff", rotation: 1 } };

/** The same plan through the Forest skin: the variant's windows. */
export const ForestVariant: Story = { args: { plan: "cccccfffc", skin: "forest", variant: 2 } };

/** 2a. The windows glowing alone, at night: the rooms seen through them glow as the openings do. */
export const WindowsGlow: Story = { args: { step: "glow", marks: [] } };

/** 2b. The light volume: the windows and the pools of light on the ground and the walls, past the tile's border too. */
export const LightVolume: Story = { args: { step: "volume", marks: [] } };

/** The towers' light at night: each tower's four windows on, the pools past the border on the neighbours' ground. */
export const TowersAtNight: Story = { args: { plan: "cccccfffc", step: "volume", marks: [] } };

/** The stagger at dusk (level 0.6): some windows still dark, a room's windows on or off together; move `cellX` for another draw. */
export const Dusk: Story = { args: { step: "volume", marks: [], nightLevel: 0.6 } };

/** The first pass's light for comparison: reach 6, falloff 1.5, no margin. */
export const FirstPassLight: Story = { args: { step: "volume", marks: [], reach: 6, falloff: 1.5, margin: 0, intensity: 0.4 } };

/** 2c. The same with rays instead of the flood: sharper beams out of the openings. */
export const LightVolumeRays: Story = { args: { step: "volume", marks: [], method: "rays" } };

/** 2d. A slice of the volume beside the tile, for debugging: the layer's light on its 40 x 40 cells. */
export const VolumeSlice: Story = { args: { step: "slice", marks: ["window"], layer: 6, plan: "ffcfffcff" } };

/** 3. The readout: windows per model, the volume's size and the build time of each step in this browser (the 19 base models). */
export const Readout: Story = { render: () => <NightWindowsTable skin="base" /> };

/** The same under the first pass's rule (the lit columns). */
export const ReadoutColumns: Story = { render: () => <NightWindowsTable skin="base" rule="columns" /> };

/** The same for the Forest variants, through the skin. */
export const ReadoutForest: Story = { render: () => <NightWindowsTable skin="forest" /> };
