import type { Meta, StoryObj } from "@storybook/react-vite";
import { DEFAULT_CLOUD_SHADOWS, DEFAULT_SMOKE_SETTINGS, QUALITY_TIERS, SEASONS, SMOKE_LOOKS, type SmokeLook } from "@paved/renderer";
import { ChimneySmokeBoard, SMOKE_PLANS, type ChimneySmokeBoardProps } from "./chimney-smoke-board";

const range = (min: number, max: number, step: number) => ({ control: { type: "range" as const, min, max, step } });
const category = (name: string) => ({ table: { category: name } });
/** A knob's two looks' values, for its description: unset, the knob takes the chosen look's. */
const looks = (key: keyof SmokeLook) => ` (unset: the look's, puffs ${SMOKE_LOOKS.puffs[key]}, wisps ${SMOKE_LOOKS.wisps[key]})`;

/** The defaults: the look "puffs" on the recorded board through the Forest skin (its smoking chimneys), autumn's day. */
const ARGS: ChimneySmokeBoardProps = {
  layout: "board",
  plan: "sfrfrfffr",
  forest: true,
  season: "autumn",
  fadeTo: null,
  time: "day",
  view: "game",
  look: "puffs",
  winterAmount: DEFAULT_SMOKE_SETTINGS.seasons.winter.amount,
  spring: DEFAULT_SMOKE_SETTINGS.seasons.spring.enabled,
  fadeSeconds: DEFAULT_SMOKE_SETTINGS.fadeSeconds,
  windDirection: DEFAULT_CLOUD_SHADOWS.windDirection,
  windSpeed: DEFAULT_CLOUD_SHADOWS.windSpeed,
  enabled: true,
  reducedMotion: false,
  quality: "auto",
};

/**
 * The chimney smoke (CHIMNEY-SMOKE-1, #770 PR 1): a study for the owner to choose the look before the board draws it (PR 2). Soft
 * billboards rise from each chimney's mouth, smoking or bare, grow and fade out about a tile above it, bent by the cloud shadows'
 * wind; all the puffs of the scene are one instanced draw, moved in the vertex shader from the ambient loop's time (the CPU sets
 * uniforms and counts); their noise is generated in the shader (nothing fetched). The smoke takes the scene's light (dimmer and
 * bluer at night), not the hour: it follows the season, on in autumn, winter and spring, off in summer, and a change of season
 * fades it over about 2 s.
 *
 * The white smoke voxels of the models are hidden while the smoke can be drawn, the mouths capped dark, in summer too (neither
 * smoke nor white voxels); under the Low tier, reduced motion or 'Ambient effects' off there is no smoke and the white voxels are
 * shown (owner, 2026-10-25). Two looks to choose from (#770, open point 2): "puffs", a light grey plume of soft round puffs, a
 * little thicker in winter; "wisps", a thinner, taller, fainter trail that sways more.
 */
const meta = {
  title: "Renderer/Chimney smoke",
  component: ChimneySmokeBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    layout: { control: "inline-radio", options: ["tile", "board"], description: "One tile, or the recorded 72-tile board", ...category("Scene") },
    plan: { control: "select", options: SMOKE_PLANS, description: "The tile of the 'tile' layout", ...category("Scene") },
    forest: { control: "boolean", description: "Every plan on its Forest variants (most of the smoking chimneys), or the base models", ...category("Scene") },
    season: { control: "inline-radio", options: SEASONS, description: "The wheel's season, held", ...category("Scene") },
    fadeTo: { control: "inline-radio", options: [null, ...SEASONS], description: "Two seconds after the board is up, the wheel turns to this season: the fade", ...category("Scene") },
    time: { control: "inline-radio", options: ["day", "night"], description: "The season's day, or its night (the smoke takes the light, not the hour)", ...category("Scene") },
    view: { control: "inline-radio", options: ["game", "phone-play", "close"], description: "The game's opening camera, a phone's play distance, or close", ...category("Scene") },
    look: { control: "inline-radio", options: ["puffs", "wisps"], description: "The look: every knob below takes its value, unless that knob was moved", ...category("Look") },
    opacity: { ...range(0, 1, 0.01), description: "A puff's opacity at its thickest" + looks("opacity"), ...category("Look") },
    puffs: { ...range(1, 32, 1), description: "The puffs a chimney sends up at a time" + looks("puffs"), ...category("Look") },
    lifeSeconds: { ...range(1, 15, 0.5), description: "A puff's time from the mouth to its fading out, s" + looks("lifeSeconds"), ...category("Look") },
    rise: { ...range(0.5, 6, 0.1), description: "How high a puff rises, world units (a tile is 3)" + looks("rise"), ...category("Look") },
    sizeStart: { ...range(0.02, 0.6, 0.01), description: "A puff's size at the mouth, world units" + looks("sizeStart"), ...category("Look") },
    sizeEnd: { ...range(0.05, 1.5, 0.01), description: "A puff's size at the top, world units" + looks("sizeEnd"), ...category("Look") },
    swirl: { ...range(0, 1, 0.01), description: "How far a puff sways at the top, world units" + looks("swirl"), ...category("Look") },
    billow: { ...range(0, 1.5, 0.05), description: "How ragged a puff's edge is" + looks("billow"), ...category("Look") },
    stretch: { ...range(0.5, 3, 0.05), description: "A puff's height over its width" + looks("stretch"), ...category("Look") },
    drift: { ...range(0, 3, 0.05), description: "How far the wind bends the plume" + looks("drift"), ...category("Look") },
    color: { control: "color", description: "The plume's lit colour" + looks("color"), ...category("Look") },
    shade: { control: "color", description: "The plume's shaded side" + looks("shade"), ...category("Look") },
    winterAmount: { ...range(0, 2, 0.05), description: "Winter's thickness (1 the look as it is)", ...category("Seasons") },
    spring: { control: "boolean", description: "Smoke in spring (on for a start; it may lose it later)", ...category("Seasons") },
    fadeSeconds: { ...range(0, 6, 0.1), description: "A change of season's fade, s", ...category("Seasons") },
    windDirection: { ...range(-180, 180, 1), description: "The cloud shadows' wind, degrees on the board", ...category("Wind") },
    windSpeed: { ...range(0, 3, 0.05), description: "The wind's speed, world units a second", ...category("Wind") },
    enabled: { control: "boolean", description: "The 'Ambient effects' setting (off: no smoke, the white voxels shown)", ...category("Settings") },
    reducedMotion: { control: "boolean", description: "Reduced motion (no smoke, the white voxels shown)", ...category("Settings") },
    quality: { control: "inline-radio", options: ["auto", ...QUALITY_TIERS], description: "The tier (Low: no smoke, the white voxels shown)", ...category("Settings") },
  },
  args: ARGS,
} satisfies Meta<typeof ChimneySmokeBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

const tile = { layout: "tile" as const, view: "close" as const };
/** The second look: the look alone, its knobs left to it. */
const wisps = { look: "wisps" as const };

/** On a tile, autumn: the base `sfrfrfffr` (two smoking chimneys, one 2 x 2, and a bare one), look "puffs". */
export const TileAutumn: Story = { args: { ...tile, forest: false, season: "autumn" } };
/** On a tile, winter: a little thicker. */
export const TileWinter: Story = { args: { ...tile, forest: false, season: "winter" } };
/** On a tile, spring. */
export const TileSpring: Story = { args: { ...tile, forest: false, season: "spring" } };
/** On a tile, summer: neither smoke nor white voxels. */
export const TileSummer: Story = { args: { ...tile, forest: false, season: "summer" } };

/** On the board (Forest skin), autumn, look "puffs". */
export const BoardAutumn: Story = { args: { season: "autumn" } };
/** On the board, winter. */
export const BoardWinter: Story = { args: { season: "winter" } };
/** On the board, spring. */
export const BoardSpring: Story = { args: { season: "spring" } };
/** On the board, summer: neither smoke nor white voxels. */
export const BoardSummer: Story = { args: { season: "summer" } };

/** The second look, "wisps", on a tile in autumn. */
export const WispsTileAutumn: Story = { args: { ...tile, forest: false, season: "autumn", ...wisps } };
/** "wisps" on a tile in winter. */
export const WispsTileWinter: Story = { args: { ...tile, forest: false, season: "winter", ...wisps } };
/** "wisps" on the board in autumn. */
export const WispsBoardAutumn: Story = { args: { season: "autumn", ...wisps } };
/** "wisps" on the board in winter. */
export const WispsBoardWinter: Story = { args: { season: "winter", ...wisps } };
/** "wisps" on the board in spring. */
export const WispsBoardSpring: Story = { args: { season: "spring", ...wisps } };

/** The fade: winter, then the wheel turns to summer two seconds after the board is up, and the smoke fades out over 2 s. */
export const FadeToSummer: Story = { args: { season: "winter", fadeTo: "summer" } };
/** At night: the smoke takes the scene's light (dimmer, bluer), it does not stop. */
export const WinterNight: Story = { args: { season: "winter", time: "night" } };
/** The Low tier: no smoke, the white voxels shown, as on the previews. */
export const LowTier: Story = { args: { season: "winter", quality: "low" } };
/** Reduced motion: no smoke, the white voxels shown. */
export const ReducedMotion: Story = { args: { season: "winter", reducedMotion: true } };
