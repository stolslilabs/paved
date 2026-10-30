import { useRef, useEffect } from "react";
import { GameScene } from "../core/GameScene";
import { createWebSurfaceAdapter } from "../core/WebSurfaceAdapter";
import { traceMark, traceMeasure, traceStart } from "../core/load-trace";
import type { RendererSettingsInput } from "../core/settings";
import type { AssetManifest } from "../core/AssetLoader";
import { NO_SKINS, type TileSkins } from "../core/skins";
import type { PlacementSlot } from "../core/placement";
import type { TilePressListener } from "../core/interaction";
import type { FogCell } from "../core/fog-of-war-settings";
import type { ClosedStructure } from "../core/closed-structures";
import type {
  TileRenderData,
  HoverState,
  CameraMode,
} from "../core/types";

export interface GameCanvasProps {
  tiles?: TileRenderData[];
  hover?: HoverState | null;
  /** The legal slots of the tile in hand (any rotation); `fits` false: the current rotation does not fit (dashed). */
  availableSlots?: ReadonlyArray<PlacementSlot>;
  /**
   * A placement just confirmed (`GameScene.setConfirmedTile`): its effects turn green and fade out. A new `key` (or cell)
   * starts a new fade; null removes it.
   */
  confirmed?: (HoverState & { key?: string | number }) | null;
  strategyMode?: boolean;
  compassRotation?: number;
  cameraMode?: CameraMode;
  basePath?: string;
  style?: React.CSSProperties;
  className?: string;
  /** Outlines and camera zoom limits (`RendererSettings`); unnamed fields take the defaults. */
  settings?: RendererSettingsInput;
  /** The theme of each plan (`GameScene.setSkins`): skinned plans draw a variant per tile. Unset: the base models. */
  skins?: TileSkins;
  /** A manifest the host gives instead of `<basePath>/manifest.json` (`RendererConfig.manifest`); read at init. */
  manifest?: AssetManifest;
  /** The board is covered (a full-screen sheet, the score panel): the ambient loop stops (`GameScene.setCovered`). */
  covered?: boolean;
  /**
   * The fog of war's clear cells and the cells a new one lifts from (`GameScene.setFogReveal`): the board's tiles and free
   * slots, or a village's owned cells and their neighbours. Unset: no fog. It shows with `settings.fog` on.
   */
  fogReveal?: { cells: ReadonlyArray<FogCell>; origin?: ReadonlyArray<FogCell> } | null;
  /**
   * Every structure closed so far, with a stable id and its areas (`GameScene.setClosedStructures`, CLOSE-SHINE): the ones
   * there when the scene opens shine at once, one that comes later pulses, then shines. Keep the array between renders while
   * it does not change. Unset: none.
   */
  closedStructures?: readonly ClosedStructure[];
  onReady?: (scene: GameScene) => void;
  /** Called when the scene cannot start, for example without a WebGL context. */
  onError?: (error: unknown) => void;
  onTileClick?: (gridX: number, gridY: number) => void;
  /** A press on a cell (`GameScene.onTilePress`): `down`, then `released` or `cancelled`; true on `released` keeps the click. */
  onTilePress?: TilePressListener;
  onTileHover?: (gridX: number, gridY: number) => void;
  onHoverLeave?: () => void;
}

/** No slot: one array, so an unset prop does not set the slots again on every render. */
const NO_SLOTS: ReadonlyArray<PlacementSlot> = [];
/** No closed structure, likewise. */
const NO_CLOSED: readonly ClosedStructure[] = [];

export function GameCanvas({
  tiles = [],
  hover = null,
  availableSlots = NO_SLOTS,
  confirmed = null,
  strategyMode = false,
  compassRotation = 0,
  cameraMode = "play",
  settings,
  skins = NO_SKINS,
  manifest,
  covered = false,
  fogReveal = null,
  closedStructures = NO_CLOSED,
  basePath = "",
  style,
  className,
  onReady,
  onError,
  onTileClick,
  onTilePress,
  onTileHover,
  onHoverLeave,
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);

  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onTileClickRef = useRef(onTileClick);
  const onTilePressRef = useRef(onTilePress);
  const onTileHoverRef = useRef(onTileHover);
  const onHoverLeaveRef = useRef(onHoverLeave);

  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onTileClickRef.current = onTileClick; }, [onTileClick]);
  useEffect(() => { onTilePressRef.current = onTilePress; }, [onTilePress]);
  useEffect(() => { onTileHoverRef.current = onTileHover; }, [onTileHover]);
  useEffect(() => { onHoverLeaveRef.current = onHoverLeave; }, [onHoverLeave]);
  // Read at init; later changes go through setSettings.
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const coveredRef = useRef(covered);
  useEffect(() => { coveredRef.current = covered; }, [covered]);
  // The camera's mode asked while the scene started (it has no camera before `init`), applied as it starts.
  const cameraModeRef = useRef(cameraMode);
  useEffect(() => { cameraModeRef.current = cameraMode; }, [cameraMode]);
  const fogRevealRef = useRef(fogReveal);
  useEffect(() => { fogRevealRef.current = fogReveal; }, [fogReveal]);
  const manifestRef = useRef(manifest);
  useEffect(() => { manifestRef.current = manifest; }, [manifest]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Each scene owns its canvas, and so its WebGL context: disposing one scene loses only
    // its own context, never that of the next scene mounted in the same place (StrictMode
    // remounts, a `basePath` change).
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const gameScene = new GameScene();
    sceneRef.current = gameScene;
    let cancelled = false;

    traceMark("init-start");
    gameScene.init({ surface: createWebSurfaceAdapter(canvas), basePath, settings: settingsRef.current, manifest: manifestRef.current }).then(
      () => {
        // Unmounted while init was pending: never start the scene.
        if (cancelled) return;
        gameScene.onTileClick((gx, gy) => onTileClickRef.current?.(gx, gy));
        gameScene.onTilePress((gx, gy, phase) => onTilePressRef.current?.(gx, gy, phase));
        gameScene.onTileHover((gx, gy) => onTileHoverRef.current?.(gx, gy));
        gameScene.onHoverLeave(() => onHoverLeaveRef.current?.());
        gameScene.setCovered(coveredRef.current);
        if (cameraModeRef.current !== "play") gameScene.setCameraMode(cameraModeRef.current);
        gameScene.setFogReveal(fogRevealRef.current?.cells ?? null, fogRevealRef.current?.origin);
        // The first frame is drawn inside `start()`: the load trace times it (shader compiles and uploads included).
        const firstFrame = traceStart();
        gameScene.start();
        traceMeasure("first-frame", firstFrame);
        onReadyRef.current?.(gameScene);
      },
      (error: unknown) => {
        gameScene.dispose();
        if (!cancelled) onErrorRef.current?.(error);
      },
    );

    return () => {
      cancelled = true;
      sceneRef.current = null;
      // A pending init sees the scene disposed after its await and stops there.
      gameScene.dispose();
      canvas.remove();
    };
  }, [basePath]);

  // Before the tiles: the first tiles given are drawn with their skins (and their variants wanted for the first frame).
  useEffect(() => {
    sceneRef.current?.setSkins(skins);
  }, [skins]);

  useEffect(() => {
    sceneRef.current?.updateTiles(tiles);
  }, [tiles]);

  // After the tiles: a structure's cells are its tiles'. The scene's first call is the board as it opens (no pulse).
  useEffect(() => {
    sceneRef.current?.setClosedStructures(closedStructures);
  }, [closedStructures]);

  useEffect(() => {
    sceneRef.current?.setHoveredTile(hover);
  }, [hover]);

  useEffect(() => {
    sceneRef.current?.setAvailableSlots(availableSlots);
  }, [availableSlots]);

  useEffect(() => {
    sceneRef.current?.setConfirmedTile(confirmed);
  }, [confirmed]);

  useEffect(() => {
    sceneRef.current?.setStrategyMode(strategyMode);
  }, [strategyMode]);

  useEffect(() => {
    sceneRef.current?.setCompassRotation(compassRotation);
  }, [compassRotation]);

  useEffect(() => {
    sceneRef.current?.setCameraMode(cameraMode);
  }, [cameraMode]);

  useEffect(() => {
    sceneRef.current?.setSettings(settings ?? {});
  }, [settings]);

  useEffect(() => {
    sceneRef.current?.setCovered(covered);
  }, [covered]);

  useEffect(() => {
    sceneRef.current?.setFogReveal(fogReveal?.cells ?? null, fogReveal?.origin);
  }, [fogReveal]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", ...style }}
      className={className}
    />
  );
}
