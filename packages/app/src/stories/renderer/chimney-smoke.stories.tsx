import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChimneySmokeBoard } from "./chimney-smoke-board";
import { SMOKE_ARGS, SMOKE_ARG_TYPES } from "./chimney-smoke-args";

/**
 * The chimney smoke (CHIMNEY-SMOKE-1 and -2, #770), as every board draws it now (the scene's own, `RendererSettings.smoke`). Soft
 * billboards rise from each chimney's mouth, smoking or bare, grow and fade out about a tile above it, bent by the cloud shadows'
 * wind; all the puffs of the scene are one instanced draw, moved in the vertex shader from the ambient loop's time (the CPU sets
 * uniforms and counts); their noise is generated in the shader (nothing fetched). The smoke takes the scene's light (dimmer and
 * bluer at night), not the hour: it follows the season, on in autumn, winter and spring, off in summer, and a change of season
 * fades it over about 2 s.
 *
 * The white smoke voxels of the models are hidden while the smoke can be drawn, the mouths capped dark, in summer too (neither
 * smoke nor white voxels); under the Low tier, reduced motion or 'Ambient effects' off there is no smoke and the white voxels are
 * shown (owner, 2026-10-25). The default look, "varied" (#801, the owner's): a light grey plume of soft round puffs, slow and
 * faint, each chimney's leaning, shaped and tinted its own way; a little thicker in winter. #770's two looks stay for the stories:
 * "puffs", every chimney alike, and "wisps", a thinner, taller, fainter trail that sways more.
 */
const meta = {
  title: "Renderer/Chimney smoke",
  component: ChimneySmokeBoard,
  parameters: { layout: "fullscreen" },
  argTypes: SMOKE_ARG_TYPES,
  args: SMOKE_ARGS,
} satisfies Meta<typeof ChimneySmokeBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

const tile = { layout: "tile" as const, view: "close" as const };

/** On a tile, autumn: the base `sfrfrfffr` (two smoking chimneys, one 2 x 2, and a bare one), the default look. */
export const TileAutumn: Story = { args: { ...tile, forest: false, season: "autumn" } };
/** On a tile, winter: a little thicker. */
export const TileWinter: Story = { args: { ...tile, forest: false, season: "winter" } };
/** On a tile, spring. */
export const TileSpring: Story = { args: { ...tile, forest: false, season: "spring" } };
/** On a tile, summer: neither smoke nor white voxels. */
export const TileSummer: Story = { args: { ...tile, forest: false, season: "summer" } };

/** On the board (Forest skin), autumn, the default look. */
export const BoardAutumn: Story = { args: { season: "autumn" } };
/** On the board, winter. */
export const BoardWinter: Story = { args: { season: "winter" } };
/** On the board, spring. */
export const BoardSpring: Story = { args: { season: "spring" } };
/** On the board, summer: neither smoke nor white voxels. */
export const BoardSummer: Story = { args: { season: "summer" } };

/** The fade: winter, then the wheel turns to summer two seconds after the board is up, and the smoke fades out over 2 s. */
export const FadeToSummer: Story = { args: { season: "winter", fadeTo: "summer" } };
/** At night: the smoke takes the scene's light (dimmer, bluer), it does not stop. */
export const WinterNight: Story = { args: { season: "winter", time: "night" } };
/** The Low tier: no smoke, the white voxels shown, as on the previews. */
export const LowTier: Story = { args: { season: "winter", quality: "low" } };
/** Reduced motion: no smoke, the white voxels shown. */
export const ReducedMotion: Story = { args: { season: "winter", reducedMotion: true } };

/**
 * A tile placed in winter (#770 item 3): in hand (pending), it keeps its white voxels; two seconds in it is placed and drops, the
 * smoke's voxels left out of the drop, and once it has landed its smoke fades in over a second, the mouths capped dark.
 */
export const PlaceWinter: Story = { args: { ...tile, forest: false, season: "winter", place: true } };
/** The seasons on the board: autumn, winter two seconds in (thicker), then summer four seconds later (the smoke fades out, no white voxels). */
export const AutumnWinterSummer: Story = { args: { season: "autumn", fadeTo: "winter", fadeThen: "summer" } };
