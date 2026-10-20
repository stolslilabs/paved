import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import {
  DAY_PHASE_AT,
  DEFAULT_BIRD_SETTINGS,
  DEFAULT_CLOUD_SHADOWS,
  PLAY_DEFAULT_POLAR_ANGLE,
  loadBirds,
  loadWeather,
  resolveWeatherSettings,
  weatherMode,
  type Birds,
  type GameScene,
  type ParticleSettings,
  type QualityTier,
  type RendererSettingsInput,
  type Season,
  type Weather,
  type WeatherSettings,
  type WeatherSettingsInput,
} from "@paved/renderer";
import { toRenderTiles } from "../../components/containers/board-viewport";
import { WHEEL_SEASONS, wheelDayNight, type WheelState } from "../../data/season-wheel";
import { APP_ASSETS, APP_MANIFEST } from "../../mocks/assets";
import { BOARD_72 } from "../../mocks/board";
import { PHONE_PLAY_DISTANCE, sourcesOf } from "./birds-board";
import { skinsFor } from "./skins-board";

/** The wheel (#547, `data/season-wheel.ts`): auto, the cycle's season; fixed, the chosen season's day held (or its night here). */
export type WeatherWheel = "auto" | "fixed";
/** The game's opening camera (`focusBoard`) or a phone's play distance at the game's tilt. */
export type WeatherView = "game" | "phone-play";

/** One falling layer's knobs, as the controls name them (`rainDensity`, `snowWind`...). */
export type LayerProps<P extends string> = { [K in `${P}On` | `${P}Density` | `${P}Speed` | `${P}Size` | `${P}Opacity` | `${P}Wind`]: K extends `${P}On` ? boolean : number };

export type WeatherBoardProps = LayerProps<"rain"> &
  LayerProps<"leaves"> &
  LayerProps<"snow"> &
  LayerProps<"petals"> & {
    /** The weather on (the study's own switch). */
    weather: boolean;
    area: number;
    fadeSeconds: number;
    /** The particles' light at full night, a share of the day's. */
    nightShare: number;
    summerOn: boolean;
    summerGrade: string;
    summerGradeAmount: number;
    summerBrightness: number;
    glare: number;
    glareSize: number;
    shimmer: number;
    shimmerSpeed: number;
    autumnOn: boolean;
    autumnGrade: string;
    autumnGradeAmount: number;
    splashes: number;
    autumnClouds: number;
    winterOn: boolean;
    winterGrade: string;
    winterGradeAmount: number;
    snowCover: number;
    springOn: boolean;
    springGrade: string;
    springGradeAmount: number;
    raysOn: boolean;
    raysDensity: number;
    raysOpacity: number;
    raysSize: number;
    raysSpeed: number;
    /** The birds of #574 in spring (not validated yet: off by default). */
    springBirds: boolean;
    /** The season: the wheel's fixed one, or where the cycle starts with the wheel on auto. */
    season: Season;
    wheel: WeatherWheel;
    /** With the wheel fixed: its day (the game's) or its night (to judge the weather at night). */
    time: "day" | "night";
    /** With the wheel on auto: how fast the cycle runs (1 the game's, a day and a night in two minutes). */
    speed: number;
    view: WeatherView;
    /** The cloud shadows of #573 (their wind blows the rain, the leaves, the snow and the petals). */
    clouds: boolean;
    windDirection: number;
    windSpeed: number;
    /** The 'Ambient effects' setting. */
    enabled: boolean;
    /** Reduced motion: nothing falls, only the static parts show. */
    reducedMotion: boolean;
    fps: number;
    quality: QualityTier | "auto";
  };

const BOARD_TILES = toRenderTiles(BOARD_72.tiles, 1);
const NO_SKINS = skinsFor("none");

const layer = (props: WeatherBoardProps, p: "rain" | "leaves" | "snow" | "petals"): ParticleSettings => {
  const at = props as unknown as Record<string, number & boolean>;
  return { enabled: at[`${p}On`], density: at[`${p}Density`], speed: at[`${p}Speed`], size: at[`${p}Size`], opacity: at[`${p}Opacity`], wind: at[`${p}Wind`] };
};

/** The controls as the weather's settings. */
export function weatherInput(props: WeatherBoardProps): WeatherSettingsInput {
  return {
    enabled: props.weather,
    area: props.area,
    fadeSeconds: props.fadeSeconds,
    night: props.nightShare,
    summer: {
      enabled: props.summerOn,
      grade: { color: props.summerGrade, amount: props.summerGradeAmount },
      brightness: props.summerBrightness,
      glare: props.glare,
      glareSize: props.glareSize,
      shimmer: props.shimmer,
      shimmerSpeed: props.shimmerSpeed,
    },
    autumn: {
      enabled: props.autumnOn,
      grade: { color: props.autumnGrade, amount: props.autumnGradeAmount },
      rain: layer(props, "rain"),
      splashes: props.splashes,
      leaves: layer(props, "leaves"),
      clouds: props.autumnClouds,
    },
    winter: { enabled: props.winterOn, grade: { color: props.winterGrade, amount: props.winterGradeAmount }, snow: layer(props, "snow"), cover: props.snowCover },
    spring: {
      enabled: props.springOn,
      grade: { color: props.springGrade, amount: props.springGradeAmount },
      rays: { enabled: props.raysOn, density: props.raysDensity, opacity: props.raysOpacity, size: props.raysSize, speed: props.raysSpeed },
      petals: layer(props, "petals"),
    },
  };
}

/**
 * The cycle's settings for the wheel (`wheelDayNight`, as the game's board): auto runs the cycle from `season`; fixed holds the
 * season's day, or here its night. The season is the cycle's first too: under reduced motion the cycle holds its first season.
 */
export function weatherDayNight(props: Pick<WeatherBoardProps, "wheel" | "season" | "time" | "speed" | "reducedMotion">): RendererSettingsInput["dayNight"] {
  const state: WheelState = props.wheel === "auto" ? "auto" : props.season;
  const { enabled, freezeAt } = wheelDayNight(state, true);
  const held = freezeAt === null ? null : props.time === "night" ? WHEEL_SEASONS.indexOf(props.season) + DAY_PHASE_AT.night : freezeAt;
  return { enabled, season: props.season, speed: props.speed, freezeAt: held, reducedMotion: props.reducedMotion };
}

const p95 = (values: number[]) => (values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * 0.95))]! : 0);

interface Readout {
  mode: string;
  season: string;
  layers: string;
  weatherDraws: number;
  drawCalls: number;
  cpuP95: number;
  framesPerSecond: number;
  loop: string;
  webgl: string;
}

/**
 * The weather (WEATHER-STUDY, #607 PR 2) on the recorded 72-tile board at the game's camera, under the day and night cycle and the
 * season wheel. The board does not call the weather: the story loads its chunk (`loadWeather`), adds it to the scene, hands it the
 * tile shader's snow (`scene.tiles.snowUniforms`) and registers it on the scene's one ambient loop (`scene.ambient`), which steps
 * it at its capped rate and stops while the tab is hidden or the effects are off. Its mode follows the settings, the tier and
 * reduced motion (`weatherMode`); its season and daylight the cycle (`setCycle`); its wind the cloud shadows' (`setWind`). Every
 * knob is a control; the readout gives the weather's draws and the frame's, the frames a second and the frame's CPU time, p95.
 * The scene is exposed to the measuring scripts as `window.__weatherScene`, the weather as `window.__weather`.
 */
export function WeatherBoard(props: WeatherBoardProps) {
  const { view, clouds, windDirection, windSpeed, enabled, reducedMotion, fps, quality, springBirds } = props;
  const [scene, setScene] = useState<GameScene | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [ready, setReady] = useState(false);
  const [readout, setReadout] = useState<Readout | null>(null);
  const settingsKey = JSON.stringify(weatherInput(props));
  const weatherSettings = useMemo<WeatherSettings>(() => resolveWeatherSettings(JSON.parse(settingsKey) as WeatherSettingsInput), [settingsKey]);
  const dayNightKey = JSON.stringify(weatherDayNight(props));
  const settings = useMemo<RendererSettingsInput>(
    () => ({
      quality,
      dayNight: JSON.parse(dayNightKey) as RendererSettingsInput["dayNight"],
      ambient: {
        enabled,
        fps,
        reducedMotion,
        clouds: {
          enabled: clouds,
          windDirection,
          windSpeed,
          // More clouds in autumn (the weather's proposal), by the clouds' own season factor.
          seasonCoverage: { ...DEFAULT_CLOUD_SHADOWS.seasonCoverage, autumn: DEFAULT_CLOUD_SHADOWS.seasonCoverage.autumn * (weatherSettings.enabled && weatherSettings.autumn.enabled ? weatherSettings.autumn.clouds : 1) },
        },
      },
    }),
    [quality, dayNightKey, enabled, fps, reducedMotion, clouds, windDirection, windSpeed, weatherSettings],
  );
  const settingsRef = useRef(weatherSettings);
  settingsRef.current = weatherSettings;

  const onReady = useCallback((s: GameScene) => {
    setScene(s);
    (window as unknown as { __weatherScene?: GameScene }).__weatherScene = s;
  }, []);

  // The weather: its chunk, in the scene (world space), on the scene's ambient loop, with the tiles' snow.
  useEffect(() => {
    if (!scene) return;
    let alive = true;
    let made: Weather | null = null;
    let unregister = () => {};
    void loadWeather().then(({ Weather }) => {
      if (!alive) return;
      made = new Weather(scene.ambient.time, scene.tiles.snowUniforms, settingsRef.current);
      made.onChange = () => scene.requestRender();
      scene.scene.add(made.object);
      unregister = scene.ambient.register(made);
      (window as unknown as { __weather?: Weather }).__weather = made;
      setWeather(made);
    });
    return () => {
      alive = false;
      unregister();
      made?.dispose();
      scene.requestRender();
      setWeather(null);
    };
  }, [scene]);

  useEffect(() => {
    weather?.setSettings(weatherSettings);
  }, [weather, weatherSettings]);

  useEffect(() => {
    weather?.setWind(windDirection, windSpeed);
  }, [weather, windDirection, windSpeed]);

  // The mode: off on the Low tier and with the effects off, still under reduced motion (the scene's tier, resolved from "auto").
  useEffect(() => {
    if (!scene || !weather) return;
    weather.setMode(weatherMode(weatherSettings, { enabled, reducedMotion }, scene.getQuality(), false));
  }, [scene, weather, weatherSettings, enabled, reducedMotion, quality]);

  // The season and the daylight: the cycle's point, read four times a second (the season wheel reads it once a second).
  useEffect(() => {
    if (!scene || !weather) return;
    const sync = () => {
      const point = scene.getDayNight();
      weather.setCycle(point);
      setSeason(point?.season ?? null);
    };
    sync();
    const id = window.setInterval(sync, 250);
    return () => clearInterval(id);
  }, [scene, weather]);

  // Spring's birds (#574), on the same loop, while the season is spring and the switch on.
  const birdsOn = springBirds && season === "spring";
  useEffect(() => {
    if (!scene || !birdsOn) return;
    let alive = true;
    let made: Birds | null = null;
    let unregister = () => {};
    let timer = 0;
    void loadBirds().then(({ Birds }) => {
      if (!alive) return;
      const birds = new Birds(scene.ambient.time, DEFAULT_BIRD_SETTINGS);
      made = birds;
      birds.onChange = () => scene.requestRender();
      scene.tiles.getGroup().add(birds.object);
      unregister = scene.ambient.register(birds);
      let last = "";
      timer = window.setInterval(() => {
        birds.setNight(scene.getDayNight()?.phase === "night");
        const sources = sourcesOf(scene, BOARD_TILES, NO_SKINS);
        const signature = sources.map((s) => `${s.key}@${s.tile.uuid}`).join("|");
        if (signature === last) return;
        last = signature;
        birds.setTiles(sources, scene.tiles.getGroup());
      }, 500);
    });
    return () => {
      alive = false;
      clearInterval(timer);
      unregister();
      made?.dispose();
      scene.requestRender();
    };
  }, [scene, birdsOn]);

  // The camera: the game's opening (`focusBoard`), or a phone's play distance at the game's tilt.
  useEffect(() => {
    if (!scene) return;
    scene.focusBoard();
    if (view === "phone-play") {
      const target = scene.controls.controls.target;
      scene.camera.position.set(target.x, target.y + PHONE_PLAY_DISTANCE * Math.cos(PLAY_DEFAULT_POLAR_ANGLE), target.z + PHONE_PLAY_DISTANCE * Math.sin(PLAY_DEFAULT_POLAR_ANGLE));
      scene.camera.lookAt(target);
    }
    scene.requestRender();
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setReady(true))));
    return () => cancelAnimationFrame(id);
  }, [scene, view]);

  // The readout: the frame observer times each frame drawn and counts its draws (three's counters kept over the passes).
  useEffect(() => {
    if (!scene || !weather) return;
    const info = scene.renderer.info;
    info.autoReset = false;
    const times: number[] = [];
    const stamps: number[] = [];
    let calls = 0;
    scene.setFrameObserver({
      beforeRender: () => info.reset(),
      afterTick: ({ cpuMs, rendered }) => {
        if (!rendered) return;
        calls = info.render.calls;
        times.push(cpuMs);
        stamps.push(performance.now());
        if (times.length > 120) times.shift();
      },
    });
    const timer = window.setInterval(() => {
      while (stamps.length && stamps[0]! < performance.now() - 1000) stamps.shift();
      const ambient = scene.getAmbient();
      const stats = weather.stats();
      const point = scene.getDayNight();
      const counts = Object.entries(stats.particles)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k}`);
      if (stats.splashes) counts.push(`${stats.splashes} splashes`);
      if (stats.rays) counts.push(`${stats.rays} rays`);
      if (stats.cover > 0) counts.push(`snow on ${Math.round(stats.cover * 100)} % of the tops`);
      setReadout({
        mode: stats.mode,
        season: point ? `${point.season} ${point.phase}` : "no cycle",
        layers: counts.join(" · ") || "nothing falls",
        weatherDraws: stats.drawCalls,
        drawCalls: calls,
        cpuP95: p95(times),
        framesPerSecond: stamps.length,
        loop: ambient.running ? `loop on, cap ${ambient.fps} fps` : "loop off",
        webgl: scene.getWebGL().software ? "software WebGL: no frame time" : "GPU",
      });
    }, 500);
    return () => {
      clearInterval(timer);
      scene.setFrameObserver(null);
      info.autoReset = true;
    };
  }, [scene, weather]);

  return (
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={(ready && !!readout) || undefined}>
      <GameCanvas tiles={BOARD_TILES} skins={NO_SKINS} basePath={APP_ASSETS} manifest={APP_MANIFEST} settings={settings} onReady={onReady} style={{ position: "absolute", inset: 0 }} />
      {readout && (
        <output className="pointer-events-none absolute top-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground numeric" aria-live="off">
          <div>
            {readout.season} · weather {readout.mode} · {readout.layers}
          </div>
          <div>
            {readout.weatherDraws} weather draws of {readout.drawCalls} · {readout.framesPerSecond} frames/s · CPU p95 {readout.cpuP95.toFixed(2)} ms
          </div>
          <div>
            {readout.loop} · {readout.webgl}
          </div>
        </output>
      )}
    </div>
  );
}
