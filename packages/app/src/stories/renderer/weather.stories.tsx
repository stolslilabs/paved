import type { Meta, StoryObj } from "@storybook/react-vite";
import { AMBIENT_FPS, DEFAULT_CLOUD_SHADOWS, DEFAULT_WEATHER_SETTINGS, PARTICLE_MAX, QUALITY_TIERS, SEASONS, type ParticleSettings } from "@paved/renderer";
import { PHONE_PLAY_DISTANCE } from "./birds-board";
import { WeatherBoard, type LayerProps, type WeatherBoardProps } from "./weather-board";

const d = DEFAULT_WEATHER_SETTINGS;
const range = (min: number, max: number, step: number) => ({ control: { type: "range" as const, min, max, step } });
const category = (name: string) => ({ table: { category: name } });

/** The six controls of a falling layer, and their defaults. */
function layerControls(p: "rain" | "leaves" | "snow" | "petals", what: string, cat: string) {
  return {
    [`${p}On`]: { control: "boolean", description: `The ${what} on`, ...category(cat) },
    [`${p}Density`]: { ...range(0, 1, 0.01), description: `The share of the most ${what} (${PARTICLE_MAX[p]}) drawn`, ...category(cat) },
    [`${p}Speed`]: { ...range(0, 4, 0.05), description: `The fall's speed, times the ${what}'s own`, ...category(cat) },
    [`${p}Size`]: { ...range(0.2, 4, 0.05), description: `The size, times the ${what}'s own`, ...category(cat) },
    [`${p}Opacity`]: { ...range(0, 1, 0.01), description: `The ${what}'s opacity at its fullest`, ...category(cat) },
    [`${p}Wind`]: { ...range(0, 10, 0.1), description: `The share of the cloud shadows' wind the ${what} take`, ...category(cat) },
  };
}
const layerArgs = <P extends "rain" | "leaves" | "snow" | "petals">(p: P, s: ParticleSettings): LayerProps<P> => ({
  [`${p}On`]: s.enabled,
  [`${p}Density`]: s.density,
  [`${p}Speed`]: s.speed,
  [`${p}Size`]: s.size,
  [`${p}Opacity`]: s.opacity,
  [`${p}Wind`]: s.wind,
}) as LayerProps<P>;

/** The controls' defaults: the weather's defaults (the study's proposal), summer held at its day, at a phone's play distance. */
const ARGS: WeatherBoardProps = {
  weather: d.enabled,
  area: d.area,
  fadeSeconds: d.fadeSeconds,
  nightShare: d.night,
  summerOn: d.summer.enabled,
  summerGrade: d.summer.grade.color,
  summerGradeAmount: d.summer.grade.amount,
  summerBrightness: d.summer.brightness,
  glare: d.summer.glare,
  glareSize: d.summer.glareSize,
  shimmer: d.summer.shimmer,
  shimmerSpeed: d.summer.shimmerSpeed,
  autumnOn: d.autumn.enabled,
  autumnGrade: d.autumn.grade.color,
  autumnGradeAmount: d.autumn.grade.amount,
  ...layerArgs("rain", d.autumn.rain),
  splashes: d.autumn.splashes,
  ...layerArgs("leaves", d.autumn.leaves),
  autumnClouds: d.autumn.clouds,
  winterOn: d.winter.enabled,
  winterGrade: d.winter.grade.color,
  winterGradeAmount: d.winter.grade.amount,
  ...layerArgs("snow", d.winter.snow),
  snowCover: d.winter.cover,
  springOn: d.spring.enabled,
  springGrade: d.spring.grade.color,
  springGradeAmount: d.spring.grade.amount,
  raysOn: d.spring.rays.enabled,
  raysDensity: d.spring.rays.density,
  raysOpacity: d.spring.rays.opacity,
  raysSize: d.spring.rays.size,
  raysSpeed: d.spring.rays.speed,
  ...layerArgs("petals", d.spring.petals),
  springBirds: false,
  season: "summer",
  wheel: "fixed",
  time: "day",
  speed: 1,
  view: "phone-play",
  clouds: true,
  windDirection: DEFAULT_CLOUD_SHADOWS.windDirection,
  windSpeed: DEFAULT_CLOUD_SHADOWS.windSpeed,
  enabled: true,
  reducedMotion: false,
  fps: AMBIENT_FPS,
  quality: "medium",
};

/**
 * The weather (WEATHER-STUDY, #607 PR 2), stories only: an option to study, the board does not use it. A weather tied to the
 * season, on the season wheel (#547: auto, the cycle's season; fixed, the chosen one) and with the day and the night:
 *
 * - **Summer**, a blazing sun: a stronger, warmer light, a glare leaking in from the sun's side of the screen, a faint heat
 *   shimmer far off.
 * - **Autumn**: a fine rain (streaks along the cloud shadows' wind, a few splashes), leaves blown along that wind, more clouds,
 *   a grey grade.
 * - **Winter**: slow, soft flakes, and snow on the tiles' tops (the tile shader, voxel by voxel on the faces up), a cool grade.
 * - **Spring**: light shafts from the sun, a few drifting petals, a fresh grade; the birds of #574 if they are validated (a switch).
 *
 * Subtle by default (the particles of #572 were removed for that). Everything moves in its vertex shader on the one ambient loop:
 * one draw per layer shown, one for the grade. Off on the Low tier and with the 'Ambient effects' off; under reduced motion,
 * nothing falls: the grades, the glare, the rays held and the snow on the tops stay. At night, the glare, the rays and the grades
 * go with the sun; the rain and the snow fall on, dimmer. A change of season fades over a few seconds.
 *
 * The readout gives the weather's draws and the frame's, the frames a second and the CPU time of a frame (p95); on software WebGL
 * the time is not a measure.
 */
const meta = {
  title: "Renderer/Weather",
  component: WeatherBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    weather: { control: "boolean", description: "The weather on", ...category("weather") },
    area: { ...range(8, 160, 1), description: `The side of the square around the camera's target where it falls, world units (default ${d.area})`, ...category("weather") },
    fadeSeconds: { ...range(0, 20, 0.5), description: `A change of season fades over this many seconds (default ${d.fadeSeconds})`, ...category("weather") },
    nightShare: { ...range(0, 1, 0.05), description: `The particles' light at full night, a share of the day's (default ${d.night})`, ...category("weather") },

    summerOn: { control: "boolean", description: "Summer's weather on", ...category("summer") },
    summerGrade: { control: "color", description: `Summer's grade, the colour the board is tinted by (default ${d.summer.grade.color})`, ...category("summer") },
    summerGradeAmount: { ...range(0, 1, 0.01), description: `How much of it (default ${d.summer.grade.amount})`, ...category("summer") },
    summerBrightness: { ...range(0, 0.6, 0.01), description: `The stronger sun: its light raised by this share (default ${d.summer.brightness})`, ...category("summer") },
    glare: { ...range(0, 1.5, 0.01), description: `The sun's glare, a light leak from the sun's side of the screen (default ${d.summer.glare})`, ...category("summer") },
    glareSize: { ...range(0.1, 2, 0.05), description: `The glare's reach, a share of the screen (default ${d.summer.glareSize})`, ...category("summer") },
    shimmer: { ...range(0, 0.1, 0.002), description: `The heat shimmer far off (default ${d.summer.shimmer})`, ...category("summer") },
    shimmerSpeed: { ...range(0, 4, 0.1), description: "The shimmer's speed", ...category("summer") },

    autumnOn: { control: "boolean", description: "Autumn's weather on", ...category("autumn") },
    autumnGrade: { control: "color", description: `Autumn's grade (default ${d.autumn.grade.color})`, ...category("autumn") },
    autumnGradeAmount: { ...range(0, 1, 0.01), description: `How much of it (default ${d.autumn.grade.amount})`, ...category("autumn") },
    ...layerControls("rain", "rain", "autumn"),
    splashes: { ...range(0, 1, 0.01), description: `The splashes, a share of their most (default ${d.autumn.splashes})`, ...category("autumn") },
    ...layerControls("leaves", "leaves", "autumn"),
    autumnClouds: { ...range(0.5, 3, 0.05), description: `The cloud shadows' coverage, times this in autumn (default ${d.autumn.clouds})`, ...category("autumn") },

    winterOn: { control: "boolean", description: "Winter's weather on", ...category("winter") },
    winterGrade: { control: "color", description: `Winter's grade (default ${d.winter.grade.color})`, ...category("winter") },
    winterGradeAmount: { ...range(0, 1, 0.01), description: `How much of it (default ${d.winter.grade.amount})`, ...category("winter") },
    ...layerControls("snow", "snow", "winter"),
    snowCover: { ...range(0, 1, 0.01), description: `The share of the faces up under snow, in patches (default ${d.winter.cover})`, ...category("winter") },

    springOn: { control: "boolean", description: "Spring's weather on", ...category("spring") },
    springGrade: { control: "color", description: `Spring's grade (default ${d.spring.grade.color})`, ...category("spring") },
    springGradeAmount: { ...range(0, 1, 0.01), description: `How much of it (default ${d.spring.grade.amount})`, ...category("spring") },
    raysOn: { control: "boolean", description: "The light shafts on", ...category("spring") },
    raysDensity: { ...range(0, 1, 0.01), description: "The share of the most shafts (12) drawn", ...category("spring") },
    raysOpacity: { ...range(0, 0.4, 0.005), description: `The shafts' opacity (default ${d.spring.rays.opacity})`, ...category("spring") },
    raysSize: { ...range(0.2, 4, 0.05), description: "The shafts' size, times their own", ...category("spring") },
    raysSpeed: { ...range(0, 6, 0.1), description: "How fast the shafts breathe", ...category("spring") },
    ...layerControls("petals", "petals", "spring"),
    springBirds: { control: "boolean", description: "The birds of #574 in spring (not validated yet)", ...category("spring") },

    season: { control: "inline-radio", options: SEASONS, description: "The season: the wheel's fixed one, or where the cycle starts on auto", ...category("board") },
    wheel: { control: "inline-radio", options: ["fixed", "auto"], description: "The season wheel: fixed holds the season's day (as the game), auto runs the cycle", ...category("board") },
    time: { control: "inline-radio", options: ["day", "night"], description: "With the wheel fixed: its day (the game's) or its night", ...category("board") },
    speed: { ...range(1, 20, 1), description: "With the wheel on auto: how fast the cycle runs (1 the game's: a day and a night in two minutes)", ...category("board") },
    view: { control: "inline-radio", options: ["game", "phone-play"], description: `The game's opening camera, or a phone's play distance (${PHONE_PLAY_DISTANCE})`, ...category("board") },
    clouds: { control: "boolean", description: "The cloud shadows (#573), whose wind the weather takes", ...category("board") },
    windDirection: { ...range(0, 360, 5), description: `The clouds' wind, where it blows toward, degrees (default ${DEFAULT_CLOUD_SHADOWS.windDirection})`, ...category("board") },
    windSpeed: { ...range(0, 3, 0.05), description: `The clouds' wind, world units a second (default ${DEFAULT_CLOUD_SHADOWS.windSpeed})`, ...category("board") },
    enabled: { control: "boolean", description: "The 'Ambient effects' setting", ...category("board") },
    reducedMotion: { control: "boolean", description: "Reduced motion: nothing falls, the static parts stay", ...category("board") },
    fps: { ...range(5, 60, 1), description: `The ambient loop's rate cap (default ${AMBIENT_FPS})`, ...category("board") },
    quality: { control: "inline-radio", options: ["auto", ...QUALITY_TIERS], description: "Low turns the weather off", ...category("board") },
  },
  args: ARGS,
} satisfies Meta<typeof WeatherBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Summer, the wheel fixed (its day held, as the game): the blazing sun, a warm grade, the glare, a faint shimmer far off. */
export const Summer: Story = { args: { season: "summer" } };

/** Autumn: a fine rain along the clouds' wind, a few splashes, leaves blown along it, more clouds, a grey grade. */
export const Autumn: Story = { args: { season: "autumn" } };

/** Winter: slow, soft flakes, and snow on the tiles' tops. */
export const Winter: Story = { args: { season: "winter" } };

/** Spring: light shafts, a few petals, a fresh grade. */
export const Spring: Story = { args: { season: "spring" } };

/** The wheel on auto, the cycle ten times as fast from summer: each season's weather fades into the next's, by day and by night. */
export const Cycle: Story = { args: { wheel: "auto", speed: 10, view: "game" } };

/** Autumn's night: the rain falls on, dimmer; the grade goes with the sun. */
export const AutumnNight: Story = { args: { season: "autumn", time: "night" } };

/** Winter's night: the snow falls on, dimmer; the snow on the tops stays. */
export const WinterNight: Story = { args: { season: "winter", time: "night" } };

/** Spring with the birds of #574 (not validated yet): both on the one ambient loop. */
export const SpringWithBirds: Story = { args: { season: "spring", springBirds: true } };

/** Reduced motion, in winter: nothing falls, the snow on the tops and the grade stay. */
export const ReducedMotion: Story = { args: { season: "winter", reducedMotion: true } };

/** The Low tier: the weather is off there, whatever the setting says. */
export const LowTier: Story = { args: { season: "autumn", quality: "low" } };

/** Each season exaggerated (denser, stronger), to see the shapes and the motion: not a proposal. */
export const Exaggerated: Story = {
  args: { season: "autumn", rainDensity: 1, rainOpacity: 0.5, leavesDensity: 1, snowDensity: 1, snowCover: 1, glare: 0.8, raysOpacity: 0.2, petalsDensity: 1 },
};
