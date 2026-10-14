import { useEffect, useRef } from "react";
import { GameScene, type GameSceneDependencies } from "../core/GameScene";
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
  onReady?: (scene: GameScene) => void;
  /** Called when the scene cannot start, for example without a GL context. */
  onError?: (error: unknown) => void;
  onTileClick?: (gridX: number, gridY: number) => void;
  onTileHover?: (gridX: number, gridY: number) => void;
  onHoverLeave?: () => void;
}

export function GameCanvasNative({
  surface,
  tiles = [],
  hover = null,
  availableSlots = [],
  strategyMode = false,
  compassRotation = 0,
  cameraMode = "play",
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

  useEffect(() => {
    const scene = new GameScene({ createRenderer, createCameraController });
    sceneRef.current = scene;

    let cancelled = false;
    let settled = false;

    scene.init({ surface, basePath, effectsCapabilities }).then(
      () => {
        settled = true;
        // Unmounted while init was pending: free the scene, never start it.
        if (cancelled) {
          scene.dispose();
          return;
        }
        scene.onTileClick((gx, gy) => onTileClickRef.current?.(gx, gy));
        scene.onTileHover((gx, gy) => onTileHoverRef.current?.(gx, gy));
        scene.onHoverLeave(() => onHoverLeaveRef.current?.());
        scene.start();
        onReadyRef.current?.(scene);
      },
      (error: unknown) => {
        settled = true;
        scene.dispose();
        if (!cancelled) onErrorRef.current?.(error);
      },
    );

    return () => {
      cancelled = true;
      sceneRef.current = null;
      // While init is pending the scene is still being built: init's settlement disposes it.
      if (settled) scene.dispose();
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

  return null;
}
