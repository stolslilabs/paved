import { useEffect, useRef } from "react";
import { GameScene, type GameSceneDependencies } from "../core/GameScene";
import type { RendererSettingsInput } from "../core/settings";
import type {
  TileRenderData,
  HoverState,
  CameraMode,
  RenderSurfaceAdapter,
  EffectsCapabilities,
} from "../core/types";

export interface GameCanvasNativeProps {
  surface: RenderSurfaceAdapter;
  tiles?: TileRenderData[];
  hover?: HoverState | null;
  availableSlots?: Array<{ x: number; y: number }>;
  strategyMode?: boolean;
  compassRotation?: number;
  cameraMode?: CameraMode;
  basePath?: string;
  effectsCapabilities?: EffectsCapabilities;
  createRenderer?: GameSceneDependencies["createRenderer"];
  createCameraController?: GameSceneDependencies["createCameraController"];
  /** Outlines and camera zoom limits (`RendererSettings`); unnamed fields take the defaults. */
  settings?: RendererSettingsInput;
  onReady?: (scene: GameScene) => void;
  /** Called when the scene cannot start, for example without a GL context. */
  onError?: (error: unknown) => void;
  onTileClick?: (gridX: number, gridY: number) => void;
  onTileHover?: (gridX: number, gridY: number) => void;
  onHoverLeave?: () => void;
}

// The surface comes from the caller and outlives a scene (StrictMode remounts reuse it), and its
// GL context belongs to the surface's owner: a scene must not lose it.
const RELEASE_NOTHING = { releaseContext: false } as const;

export function GameCanvasNative({
  surface,
  tiles = [],
  hover = null,
  availableSlots = [],
  strategyMode = false,
  compassRotation = 0,
  cameraMode = "play",
  settings,
  basePath = "",
  effectsCapabilities,
  createRenderer,
  createCameraController,
  onReady,
  onError,
  onTileClick,
  onTileHover,
  onHoverLeave,
}: GameCanvasNativeProps) {
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

  useEffect(() => {
    const scene = new GameScene({ createRenderer, createCameraController });
    sceneRef.current = scene;

    let cancelled = false;

    scene.init({ surface, basePath, effectsCapabilities, settings: settingsRef.current }).then(
      () => {
        // Unmounted while init was pending: never start the scene.
        if (cancelled) return;
        scene.onTileClick((gx, gy) => onTileClickRef.current?.(gx, gy));
        scene.onTileHover((gx, gy) => onTileHoverRef.current?.(gx, gy));
        scene.onHoverLeave(() => onHoverLeaveRef.current?.());
        scene.start();
        onReadyRef.current?.(scene);
      },
      (error: unknown) => {
        scene.dispose(RELEASE_NOTHING);
        if (!cancelled) onErrorRef.current?.(error);
      },
    );

    return () => {
      cancelled = true;
      sceneRef.current = null;
      // A pending init sees the scene disposed after its await and stops there.
      scene.dispose(RELEASE_NOTHING);
    };
  }, [surface, basePath, createRenderer, createCameraController, effectsCapabilities]);

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

  return null;
}
