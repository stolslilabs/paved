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

/** The controls' defaults: the weather's defaults (what every board draws), summer held at its day, at a phone's play distance. */
const ARGS: WeatherBoardProps = {
  weather: d.enabled,
  area: d.area,
  fadeSeconds: d.fadeSeconds,
  nightShare: d.night,
  summerOn: d.summer.enabled,
  summerGrade: d.summer.grade.color,
  summerGradeAmount: d.summer.grade.amount,
  summerBrightness: d.summer.brightness,
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
  snowVeil: d.winter.veil,
  springOn: d.spring.enabled,
  springGrade: d.spring.grade.color,
  springGradeAmount: d.spring.grade.amount,
  springBrightness: d.spring.brightness,
  ...layerArgs("petals", d.spring.petals),
  springBirds: false,
  season: "summer",
  fadeTo: null,
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
 * The weather (WEATHER-STUDY, #607 PR 2; wired by WEATHER-WIRE, #658, as the owner validated it on 2026-10-20): every board's scene
 * draws it (`RendererSettings.weather`), in every mode, on the season wheel (#547: auto, the cycle's season; fixed, the chosen one)
 * and with the day and the night. This story hands the controls to the scene's settings, as the game's board hands the defaults:
 *
 * - **Summer**: a stronger, warmer light, nothing more (no glare, no shimmer: no glow, no halo).
 * - **Autumn**: a fine rain (streaks along the cloud shadows' wind, a few splashes), leaves blown along that wind, more clouds,
 *   a grey grade: the study's defaults, kept.
 * - **Winter**: slow, soft flakes over a light veil of snow on the faces up, in rounded soft-edged patches (a noise read at the
 *   fragment's place, never per voxel), so the tiles stay readable; a cool grade.
 * - **Spring**: a fresh, brighter light, nothing more (no shafts). The petals stay a knob, off; the birds of #574 are not validated,
 *   so the board does not draw them (the switch here shows them).
 *
 * Everything moves in its vertex shader on the one ambient loop: one draw per layer shown, one for the grade. Off on the Low tier,
 * with the 'Ambient effects' off and with the day and night cycle off; under reduced motion, nothing falls: the grades, the
 * brightness and the snow on the tops stay. At night the grades and the brightness go with the sun; the rain and the snow fall on,
 * dimmer. A change of season fades over three seconds.
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
    snowCover: { ...range(0, 1, 0.01), description: `The share of the faces up under a patch of snow (default ${d.winter.cover})`, ...category("winter") },
    snowVeil: { ...range(0, 1, 0.01), description: `How white a patch is at its heart, a veil (default ${d.winter.veil})`, ...category("winter") },

    springOn: { control: "boolean", description: "Spring's weather on", ...category("spring") },
    springGrade: { control: "color", description: `Spring's grade (default ${d.spring.grade.color})`, ...category("spring") },
    springGradeAmount: { ...range(0, 1, 0.01), description: `How much of it (default ${d.spring.grade.amount})`, ...category("spring") },
    springBrightness: { ...range(0, 0.6, 0.01), description: `The fresher sun: its light raised by this share (default ${d.spring.brightness})`, ...category("spring") },
    ...layerControls("petals", "petals", "spring"),
    springBirds: { control: "boolean", description: "The birds of #574 in spring (not validated yet: the board does not draw them)", ...category("spring") },

    season: { control: "inline-radio", options: SEASONS, description: "The season: the wheel's fixed one, or where the cycle starts on auto", ...category("board") },
    wheel: { control: "inline-radio", options: ["fixed", "auto"], description: "The season wheel: fixed holds the season's day (as the game), auto runs the cycle", ...category("board") },
    fadeTo: { control: "inline-radio", options: [null, ...SEASONS], description: "With the wheel fixed: two seconds in, the wheel turns to this season (a fade)", ...category("board") },
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

/** Summer, the wheel fixed (its day held, as the game): a stronger, warmer light. */
export const Summer: Story = { args: { season: "summer" } };

/** Autumn: a fine rain along the clouds' wind, a few splashes, leaves blown along it, more clouds, a grey grade. */
export const Autumn: Story = { args: { season: "autumn" } };

/** Winter: slow, soft flakes over a light veil of snow on the faces up, in rounded patches. */
export const Winter: Story = { args: { season: "winter" } };

/** Spring: a fresher, brighter light. */
export const Spring: Story = { args: { season: "spring" } };

/** Summer's night: the warmer light goes with the sun. */
export const SummerNight: Story = { args: { season: "summer", time: "night" } };

/** Autumn's night: the rain falls on, dimmer; the grade goes with the sun. */
export const AutumnNight: Story = { args: { season: "autumn", time: "night" } };

/** Winter's night: the snow falls on, dimmer; the veil on the tops stays. */
export const WinterNight: Story = { args: { season: "winter", time: "night" } };

/** Spring's night: the brighter light goes with the sun. */
export const SpringNight: Story = { args: { season: "spring", time: "night" } };

/** The wheel on auto, the cycle ten times as fast from summer: each season's weather fades into the next's, by day and by night. */
export const Cycle: Story = { args: { wheel: "auto", speed: 10, view: "game" } };

/**
 * A season fade: the wheel fixed, the season changed (autumn to winter here, as a tap on the wheel does): the rain and the leaves
 * fade out as the snow and its veil fade in, over three seconds. Change the season control to see another.
 */
export const SeasonFade: Story = { args: { season: "autumn", fadeTo: "winter" } };

/** Spring with the birds of #574 (not validated yet, so not on the board): both on the one ambient loop. */
export const SpringWithBirds: Story = { args: { season: "spring", springBirds: true } };

/** Reduced motion, in winter: nothing falls, the veil on the tops and the grade stay. */
export const ReducedMotion: Story = { args: { season: "winter", reducedMotion: true } };

/** The Low tier: the weather is off there, whatever the setting says. */
export const LowTier: Story = { args: { season: "autumn", quality: "low" } };

/** Each season exaggerated (denser, stronger), to see the shapes and the motion: not what the board draws. */
export const Exaggerated: Story = {
  args: { season: "autumn", rainDensity: 1, rainOpacity: 0.5, leavesDensity: 1, snowDensity: 1, snowCover: 1, snowVeil: 1, petalsOn: true, petalsDensity: 1 },
};
