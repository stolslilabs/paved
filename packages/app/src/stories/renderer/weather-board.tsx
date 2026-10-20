import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import {
  DAY_PHASE_AT,
  DEFAULT_BIRD_SETTINGS,
  PLAY_DEFAULT_POLAR_ANGLE,
  loadBirds,
  type Birds,
  type GameScene,
  type ParticleSettings,
  type QualityTier,
  type RendererSettingsInput,
  type Season,
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
    /** The weather on (`RendererSettings.weather.enabled`). */
    weather: boolean;
    area: number;
    fadeSeconds: number;
    /** The particles' light at full night, a share of the day's. */
    nightShare: number;
    summerOn: boolean;
    summerGrade: string;
    summerGradeAmount: number;
    summerBrightness: number;
    autumnOn: boolean;
    autumnGrade: string;
    autumnGradeAmount: number;
    splashes: number;
    autumnClouds: number;
    winterOn: boolean;
    winterGrade: string;
    winterGradeAmount: number;
    snowCover: number;
    snowVeil: number;
    springOn: boolean;
    springGrade: string;
    springGradeAmount: number;
    springBrightness: number;
    /** The birds of #574 in spring (not validated yet: off by default, and the board does not draw them). */
    springBirds: boolean;
    /** The season: the wheel's fixed one, or where the cycle starts with the wheel on auto. */
    season: Season;
    /** With the wheel fixed: two seconds after the board is up, the wheel turns to this season (a season fade); null, it stays. */
    fadeTo: Season | null;
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
    summer: { enabled: props.summerOn, grade: { color: props.summerGrade, amount: props.summerGradeAmount }, brightness: props.summerBrightness },
    autumn: {
      enabled: props.autumnOn,
      grade: { color: props.autumnGrade, amount: props.autumnGradeAmount },
      rain: layer(props, "rain"),
      splashes: props.splashes,
      leaves: layer(props, "leaves"),
      clouds: props.autumnClouds,
    },
    winter: {
      enabled: props.winterOn,
      grade: { color: props.winterGrade, amount: props.winterGradeAmount },
      snow: layer(props, "snow"),
      cover: props.snowCover,
      veil: props.snowVeil,
    },
    spring: {
      enabled: props.springOn,
      grade: { color: props.springGrade, amount: props.springGradeAmount },
      brightness: props.springBrightness,
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
 * The weather (WEATHER-WIRE, #658) on the recorded 72-tile board at the game's camera, under the day and night cycle and the season
 * wheel, drawn by the scene itself as on every board: the controls go to `RendererSettings.weather`, the scene loads the weather's
 * chunk, registers it on its one ambient loop, and hands it its mode (the tier, the 'Ambient effects', reduced motion), the cycle's
 * point and the clouds' wind. Every knob is a control; the readout gives the weather's draws and the frame's, the frames a second and
 * the frame's CPU time, p95. The scene is exposed to the measuring scripts as `window.__weatherScene`.
 */
export function WeatherBoard(props: WeatherBoardProps) {
  const { view, clouds, windDirection, windSpeed, enabled, reducedMotion, fps, quality, springBirds, fadeTo } = props;
  const [scene, setScene] = useState<GameScene | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [ready, setReady] = useState(false);
  const [readout, setReadout] = useState<Readout | null>(null);
  // The season fade: two seconds after the board is up, the wheel turns (as a tap on it does).
  const [turned, setTurned] = useState(false);
  const shown = turned && fadeTo && props.wheel === "fixed" ? { ...props, season: fadeTo } : props;
  const weatherKey = JSON.stringify(weatherInput(props));
  const dayNightKey = JSON.stringify(weatherDayNight(shown));
  const settings = useMemo<RendererSettingsInput>(
    () => ({
      quality,
      dayNight: JSON.parse(dayNightKey) as RendererSettingsInput["dayNight"],
      ambient: { enabled, fps, reducedMotion, clouds: { enabled: clouds, windDirection, windSpeed } },
      weather: JSON.parse(weatherKey) as WeatherSettingsInput,
    }),
    [quality, dayNightKey, enabled, fps, reducedMotion, clouds, windDirection, windSpeed, weatherKey],
  );

  const onReady = useCallback((s: GameScene) => {
    setScene(s);
    (window as unknown as { __weatherScene?: GameScene }).__weatherScene = s;
  }, []);

  useEffect(() => {
    setTurned(false);
    if (!ready || !fadeTo) return;
    const id = window.setTimeout(() => setTurned(true), 2000);
    return () => clearTimeout(id);
  }, [ready, fadeTo]);

  // The season the cycle draws, read twice a second (for the birds' switch).
  useEffect(() => {
    if (!scene) return;
    const sync = () => setSeason(scene.getDayNight()?.season ?? null);
    sync();
    const id = window.setInterval(sync, 500);
    return () => clearInterval(id);
  }, [scene]);

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
    if (!scene) return;
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
      const stats = scene.getWeather();
      const point = scene.getDayNight();
      const counts = Object.entries(stats?.particles ?? {})
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k}`);
      if (stats?.splashes) counts.push(`${stats.splashes} splashes`);
      if (stats && stats.cover > 0) counts.push(`snow veil on ${Math.round(stats.cover * 100)} % of the tops`);
      setReadout({
        mode: stats?.mode ?? "not loaded",
        season: point ? `${point.season} ${point.phase}` : "no cycle",
        layers: counts.join(" · ") || "nothing falls",
        weatherDraws: stats?.drawCalls ?? 0,
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
  }, [scene]);

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
