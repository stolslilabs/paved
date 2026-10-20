import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import {
  DAY_PHASE_AT,
  DEFAULT_CLOUD_SHADOWS,
  PLAY_DEFAULT_POLAR_ANGLE,
  PLAY_MAX_POLAR_ANGLE,
  type GameScene,
  type QualityTier,
  type RendererSettingsInput,
  type Season,
} from "@paved/renderer";
import { toRenderTiles } from "../../components/containers/board-viewport";
import { APP_ASSETS } from "../../mocks/assets";
import { BOARD_72 } from "../../mocks/board";

/** The cycle off (the look's fixed sun), running (two minutes a day and a night, x10 here to judge it), or held at a phase. */
export type CloudCycle = "off" | "running" | "day" | "dusk" | "night";

export interface CloudShadowsBoardProps {
  /** The 'Ambient effects' setting (the clouds are one of them). */
  enabled: boolean;
  coverage: number;
  scale: number;
  softness: number;
  darkness: number;
  windDirection: number;
  windSpeed: number;
  height: number;
  /** At night, the share of the darkness the clouds take of the moon's light (the proposal: 0, the clouds go with the sun). */
  moon: number;
  /** The visible wisps' opacity: 0 (the default) draws none. */
  wisps: number;
  /** The season's coverage factor, on (the proposal) or off. */
  seasonal: boolean;
  cycle: CloudCycle;
  season: Season;
  /** The camera's tilt from straight down, degrees: 27 the game's opening, 54 the steepest. */
  tilt: number;
  /** Camera distance: 160 a phone's play distance, about 240 the opening's. */
  distance: number;
  /** The ambient loop's rate cap. */
  fps: number;
  quality: QualityTier | "auto";
}

const BOARD_TILES = toRenderTiles(BOARD_72.tiles, 1);
const NO_SEASONS = { summer: 1, autumn: 1, winter: 1, spring: 1 };
const SEASON_INDEX: Record<Season, number> = { summer: 0, autumn: 1, winter: 2, spring: 3 };

/** The game's tilts, in degrees: the opening (27) and the steepest (54). */
export const OPENING_TILT = Math.round((PLAY_DEFAULT_POLAR_ANGLE * 180) / Math.PI);
export const STEEPEST_TILT = Math.round((PLAY_MAX_POLAR_ANGLE * 180) / Math.PI);
/** The distance a player on a phone plays at (the particles' and the outlines' stories use it too). */
export const PHONE_PLAY_DISTANCE = 160;

const p95 = (values: number[]) => (values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * 0.95))]! : 0);

interface Readout {
  clouds: string;
  drawCalls: number;
  cpuP95: number;
  framesPerSecond: number;
  loop: string;
  webgl: string;
}

/**
 * The cloud shadows (CLOUD-SHADOWS, #573) on the recorded 72-tile board at the game's camera: every knob of
 * `RendererSettings.ambient.clouds`, the cycle off, running or held, and a readout of the frames drawn: frames a second, the
 * draw calls of a frame (all passes) and its CPU time (p95 over the last 120 frames). On software WebGL (the readout says so)
 * the time is not a measure. The scene is exposed to the measuring scripts as `window.__cloudScene`.
 */
export function CloudShadowsBoard(props: CloudShadowsBoardProps) {
  const { cycle, season, tilt, distance, quality } = props;
  const [scene, setScene] = useState<GameScene | null>(null);
  const [ready, setReady] = useState(false);
  const [readout, setReadout] = useState<Readout | null>(null);
  const key = JSON.stringify(props);
  const settings = useMemo<RendererSettingsInput>(
    () => ({
      quality,
      dayNight:
        cycle === "off"
          ? { enabled: false }
          : { enabled: true, season, reducedMotion: false, speed: cycle === "running" ? 10 : 1, freezeAt: cycle === "running" ? null : SEASON_INDEX[season] + DAY_PHASE_AT[cycle] },
      ambient: {
        enabled: props.enabled,
        fps: props.fps,
        reducedMotion: false,
        clouds: {
          coverage: props.coverage,
          scale: props.scale,
          softness: props.softness,
          darkness: props.darkness,
          windDirection: props.windDirection,
          windSpeed: props.windSpeed,
          height: props.height,
          moon: props.moon,
          wisps: props.wisps,
          seasonCoverage: props.seasonal ? DEFAULT_CLOUD_SHADOWS.seasonCoverage : NO_SEASONS,
        },
      },
    }),
    [key], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const onReady = useCallback((s: GameScene) => {
    setScene(s);
    (window as unknown as { __cloudScene?: GameScene }).__cloudScene = s;
  }, []);

  // The game's camera: where it opens (`focusBoard`), at the tilt and distance given.
  useEffect(() => {
    if (!scene) return;
    scene.focusBoard();
    const target = scene.controls.controls.target;
    const polar = (tilt * Math.PI) / 180;
    scene.camera.position.set(target.x, target.y + distance * Math.cos(polar), target.z + distance * Math.sin(polar));
    scene.camera.lookAt(target);
    scene.requestRender();
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setReady(true))));
    return () => cancelAnimationFrame(id);
  }, [scene, tilt, distance]);

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
      // The frames of the last second, aged here too: an idle board (nothing drawn) reads 0 frames/s.
      while (stamps.length && stamps[0]! < performance.now() - 1000) stamps.shift();
      const ambient = scene.getAmbient();
      const clouds = scene.getClouds();
      setReadout({
        clouds: !clouds ? "clouds not loaded" : clouds.visible ? `clouds ${Math.round(clouds.coverage * 100)} %, ${Math.round(clouds.darkness * 100)} % of the sun${clouds.wisps ? ", wisps" : ""}` : "clouds off",
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
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={ready || undefined}>
      <GameCanvas tiles={BOARD_TILES} basePath={APP_ASSETS} settings={settings} onReady={onReady} style={{ position: "absolute", inset: 0 }} />
      {readout && (
        <output className="absolute top-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground numeric" aria-live="off">
          {readout.loop} · {readout.clouds} · {readout.drawCalls} draws · {readout.framesPerSecond} frames/s · CPU p95 {readout.cpuP95.toFixed(2)} ms · {readout.webgl}
        </output>
      )}
    </div>
  );
}
