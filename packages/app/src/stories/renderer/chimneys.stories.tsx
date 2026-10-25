import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ChimneyReject } from "@paved/renderer";
import { CHIMNEY_PLANS, CHIMNEY_REASONS, ChimneysGallery, ChimneysTable, ChimneysTile, type ChimneyMark } from "./chimneys-tile";

/**
 * The chimneys (CHIMNEY-SMOKE-1, #770 PR 1): found in each model's voxel grid, once per model type (`findChimneys`), for the owner
 * to check before the smoke is wired. Two kinds: the smoking chimneys, whose white smoke voxels the model draws over the stack
 * (boxed in magenta, the mouth filled), and the bare ones, a stack with nothing on it (owner, 2026-10-25: every chimney smokes),
 * found as a narrow high point on a roof (boxed in cyan over the mouth; dashed when not in the stacks' colours, which are a hint
 * only). The candidates the rules reject are marked apart, dashed: the light voxels that are not smoke in orange (a wonder's
 * whites), the high points that are not chimneys in yellow (crenels, tree tops, posts, spires), by reason.
 *
 * Each tile is drawn on a 2D canvas (isometric, turn it with `rotation`), so it reads the same on any WebGL, software included.
 * `hidden` shows what the board will draw where the real smoke is: the smoke voxels left out, the mouths capped dark.
 */
const MARKS: ChimneyMark[] = ["smoking", "bare", "plume", "high point"];
/**
 * The reasons shown by default: the rare ones. Crenels, merlons, tree tops, the slab's posts, the wonders' ornaments and the roofs'
 * apexes are many; tick them to see them.
 */
const COMMON: ChimneyReject[] = ["crenel", "wall", "vegetation", "no roof", "on the ground", "wonder", "roof"];
const SHOWN_REASONS = CHIMNEY_REASONS.filter((r) => !COMMON.includes(r));

const meta = {
  title: "Renderer/Chimneys",
  component: ChimneysTile,
  parameters: { layout: "fullscreen" },
  argTypes: {
    plan: { control: "select", options: CHIMNEY_PLANS, description: "The plan whose model is read" },
    skin: { control: "inline-radio", options: ["base", "forest"], description: "The base model, or its Forest variant through the skin" },
    variant: { control: { type: "range", min: 1, max: 9, step: 1 }, description: "Which Forest variant (clamped to what the plan has)" },
    rotation: { control: { type: "range", min: 0, max: 3, step: 1 }, description: "Quarter turns of the view" },
    marks: { control: "check", options: MARKS, description: "What is marked: the two kinds of chimney, the rejected plumes and high points" },
    reasons: { control: "check", options: CHIMNEY_REASONS, description: "The rejected candidates shown, by reason" },
    hidden: { control: "boolean", description: "The smoke voxels left out and the mouths capped: the board where the real smoke is drawn" },
    scale: { control: { type: "range", min: 3, max: 14, step: 1 }, description: "A voxel's size on the view, px" },
  },
  args: { plan: "sfrfrfffr", skin: "base", variant: 1, rotation: 0, marks: MARKS, reasons: SHOWN_REASONS, hidden: false, scale: 9 },
} satisfies Meta<typeof ChimneysTile>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One model: the base `sfrfrfffr`, two smoking chimneys (one with a 2 x 2 plume). */
export const Tile: Story = {};

/** The same with the smoke hidden and the mouths capped. */
export const TileSmokeHidden: Story = { args: { hidden: true } };

/** Both kinds on one model: the base `rfffrfffr`, a smoking chimney and a bare one. */
export const SmokingAndBare: Story = { args: { plan: "rfffrfffr" } };

/** A base model whose one chimney is bare: its Forest variant 1 smokes from the same stack (`SmokingVariant`). */
export const Bare: Story = { args: { plan: "cfffcfffc" } };

/** The Forest variant 1 of `cfffcfffc`: the same stack, smoking. */
export const SmokingVariant: Story = { args: { plan: "cfffcfffc", skin: "forest", variant: 1 } };

/** The city houses' light-stone stacks (entry 222, not the chimneys' colour: dashed), for the owner to judge. */
export const LightStoneStacks: Story = { args: { plan: "cccccfrfc", rotation: 0 } };

/** The wonder: its whites are rejected as smoke (orange), its ornaments as chimneys (yellow). */
export const Wonder: Story = { args: { plan: "wfffffffr", reasons: CHIMNEY_REASONS } };

/** Every reason shown: the crenels, the merlons, the tree tops and the posts too. */
export const AllRejected: Story = { args: { plan: "cccccfffc", reasons: CHIMNEY_REASONS } };

/** Every base model with a chimney (or a rejected plume), its chimneys marked: the owner's check. */
export const Gallery: Story = {
  render: (args) => <ChimneysGallery skin="base" only rotation={args.rotation} marks={args.marks} reasons={args.reasons} hidden={args.hidden} scale={4} />,
};

/** The same for the 72 Forest variants. */
export const GalleryForest: Story = {
  render: (args) => <ChimneysGallery skin="forest" only rotation={args.rotation} marks={args.marks} reasons={args.reasons} hidden={args.hidden} scale={4} />,
};

/** The readout: per model, the chimneys by kind, their mouths, the rejected candidates and the build times in this browser. */
export const Readout: Story = { render: () => <ChimneysTable skin="base" /> };

/** The same for the Forest variants. */
export const ReadoutForest: Story = { render: () => <ChimneysTable skin="forest" /> };
