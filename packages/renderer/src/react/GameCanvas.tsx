import { useRef, useEffect } from "react";
import { GameScene } from "../core/GameScene";
import { createWebSurfaceAdapter } from "../core/WebSurfaceAdapter";
import type { RendererSettingsInput } from "../core/settings";
import type { AssetManifest } from "../core/AssetLoader";
import { NO_SKINS, type TileSkins } from "../core/skins";
import type { PlacementSlot } from "../core/placement";
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
  onReady?: (scene: GameScene) => void;
  /** Called when the scene cannot start, for example without a WebGL context. */
  onError?: (error: unknown) => void;
  onTileClick?: (gridX: number, gridY: number) => void;
  onTileHover?: (gridX: number, gridY: number) => void;
  onHoverLeave?: () => void;
}

/** No slot: one array, so an unset prop does not set the slots again on every render. */
const NO_SLOTS: ReadonlyArray<PlacementSlot> = [];

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
  basePath = "",
  style,
  className,
  onReady,
  onError,
  onTileClick,
  onTileHover,
  onHoverLeave,
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);

  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onTileClickRef = useRef(onTileClick);
  const onTileHoverRef = useRef(onTileHover);
  const onHoverLeaveRef = useRef(onHoverLeave);

  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onTileClickRef.current = onTileClick; }, [onTileClick]);
  useEffect(() => { onTileHoverRef.current = onTileHover; }, [onTileHover]);
  useEffect(() => { onHoverLeaveRef.current = onHoverLeave; }, [onHoverLeave]);
  // Read at init; later changes go through setSettings.
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
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

    gameScene.init({ surface: createWebSurfaceAdapter(canvas), basePath, settings: settingsRef.current, manifest: manifestRef.current }).then(
      () => {
        // Unmounted while init was pending: never start the scene.
        if (cancelled) return;
        gameScene.onTileClick((gx, gy) => onTileClickRef.current?.(gx, gy));
        gameScene.onTileHover((gx, gy) => onTileHoverRef.current?.(gx, gy));
        gameScene.onHoverLeave(() => onHoverLeaveRef.current?.());
        gameScene.start();
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

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", ...style }}
      className={className}
    />
  );
}
