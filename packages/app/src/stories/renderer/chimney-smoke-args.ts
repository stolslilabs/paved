// The chimney smoke stories' controls (#770, #801), shared by "Renderer/Chimney smoke" and "Renderer/Chimney smoke tune".
import { DEFAULT_CLOUD_SHADOWS, DEFAULT_SMOKE_SETTINGS, NO_SMOKE_VARIATION, QUALITY_TIERS, SEASONS, SMOKE_LOOKS, SMOKE_VARIATION, type SmokeLook, type SmokeVariation } from "@paved/renderer";
import type { ArgTypes } from "@storybook/react-vite";
import { SMOKE_PLANS, type ChimneySmokeBoardProps } from "./chimney-smoke-board";

const range = (min: number, max: number, step: number) => ({ control: { type: "range" as const, min, max, step } });
const category = (name: string) => ({ table: { category: name } });
/** A knob's two looks' values, for its description: unset, the knob takes the chosen look's. */
const looks = (key: keyof SmokeLook) => ` (unset: the look's, varied ${SMOKE_LOOKS.varied[key]}, puffs ${SMOKE_LOOKS.puffs[key]}, wisps ${SMOKE_LOOKS.wisps[key]})`;

/** The defaults: the default look ("varied", #801) on the recorded board through the Forest skin (its smoking chimneys), autumn's day. */
export const SMOKE_ARGS: ChimneySmokeBoardProps = {
  layout: "board",
  plan: "sfrfrfffr",
  forest: true,
  season: "autumn",
  fadeTo: null,
  fadeThen: null,
  place: false,
  time: "day",
  view: "game",
  look: DEFAULT_SMOKE_SETTINGS.look,
  winterAmount: DEFAULT_SMOKE_SETTINGS.seasons.winter.amount,
  spring: DEFAULT_SMOKE_SETTINGS.seasons.spring.enabled,
  fadeSeconds: DEFAULT_SMOKE_SETTINGS.fadeSeconds,
  windDirection: DEFAULT_CLOUD_SHADOWS.windDirection,
  windSpeed: DEFAULT_CLOUD_SHADOWS.windSpeed,
  enabled: true,
  reducedMotion: false,
  quality: "auto",
};

/** A variation's knob's value on the looks, for its description: the default's, and #770's two (none but the pace). */
const vary = (key: keyof SmokeVariation) => ` (unset: the look's, varied ${SMOKE_VARIATION[key]}, puffs and wisps ${NO_SMOKE_VARIATION[key]})`;

/** Every control of the smoke's stories. */
export const SMOKE_ARG_TYPES: Partial<ArgTypes<ChimneySmokeBoardProps>> = {
  layout: { control: "inline-radio", options: ["tile", "board"], description: "One tile, or the recorded 72-tile board", ...category("Scene") },
  plan: { control: "select", options: SMOKE_PLANS, description: "The tile of the 'tile' layout", ...category("Scene") },
  forest: { control: "boolean", description: "Every plan on its Forest variants (most of the smoking chimneys), or the base models", ...category("Scene") },
  season: { control: "inline-radio", options: SEASONS, description: "The wheel's season, held", ...category("Scene") },
  fadeTo: { control: "inline-radio", options: [null, ...SEASONS], description: "Two seconds after the board is up, the wheel turns to this season: the fade", ...category("Scene") },
  fadeThen: { control: "inline-radio", options: [null, ...SEASONS], description: "Four seconds after that, the wheel turns again, to this season", ...category("Scene") },
  place: { control: "boolean", description: "The tile layout: the tile starts in hand (pending, its white voxels), then is placed and dropped", ...category("Scene") },
  time: { control: "inline-radio", options: ["day", "night"], description: "The season's day, or its night (the smoke takes the light, not the hour)", ...category("Scene") },
  view: { control: "inline-radio", options: ["game", "phone-play", "close"], description: "The game's opening camera, a phone's play distance, or close", ...category("Scene") },
  look: { control: "inline-radio", options: ["varied", "puffs", "wisps"], description: "The look (varied the default, #801; puffs and wisps #770's): every knob below takes its value, unless that knob was moved", ...category("Look") },
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
  roll: { ...range(0, 0.5, 0.005), description: "How fast the noise of a puff's edge rolls upward, a share of the time" + looks("roll"), ...category("Look") },
  swaySpeed: { ...range(0, 2, 0.05), description: "How fast a puff sways, a share of #770's" + looks("swaySpeed"), ...category("Look") },
  varyDirection: { ...range(0, 90, 1), description: "Each plume's lean off the wind, degrees either side" + vary("direction"), ...category("Variation") },
  varyDrift: { ...range(0, 1, 0.05), description: "Each plume's drift, a share either side (1: some rise straight)" + vary("drift"), ...category("Variation") },
  varyShape: { ...range(0, 1, 0.05), description: "Each plume's stretch, billow, swirl and puff count, a share either side" + vary("shape"), ...category("Variation") },
  varyTone: { ...range(0, 0.4, 0.01), description: "Each plume whiter or darker, a share either side" + vary("tone"), ...category("Variation") },
  varyPuffTone: { ...range(0, 0.2, 0.01), description: "Each puff's own tone over its plume's, a share either side" + vary("puffTone"), ...category("Variation") },
  varyOpacity: { ...range(0, 0.6, 0.01), description: "Each plume's opacity, a share either side" + vary("opacity"), ...category("Variation") },
  varyPace: { ...range(0, 0.5, 0.01), description: "Each chimney's pace, its puffs' life times 1 ± this" + vary("pace"), ...category("Variation") },
  label: { table: { disable: true } },
  contained: { table: { disable: true } },
};
