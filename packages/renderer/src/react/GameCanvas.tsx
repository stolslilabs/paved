import { useRef, useEffect } from "react";
import { GameScene } from "../core/GameScene";
import { createWebSurfaceAdapter } from "../core/WebSurfaceAdapter";
import type {
  TileRenderData,
  HoverState,
  CameraMode,
} from "../core/types";

export interface GameCanvasProps {
  tiles?: TileRenderData[];
  hover?: HoverState | null;
  availableSlots?: Array<{ x: number; y: number }>;
  strategyMode?: boolean;
  compassRotation?: number;
  cameraMode?: CameraMode;
  basePath?: string;
  style?: React.CSSProperties;
  className?: string;
  onReady?: (scene: GameScene) => void;
  /** Called when the scene cannot start, for example without a WebGL context. */
  onError?: (error: unknown) => void;
  onTileClick?: (gridX: number, gridY: number) => void;
  onTileHover?: (gridX: number, gridY: number) => void;
  onHoverLeave?: () => void;
}

export function GameCanvas({
  tiles = [],
  hover = null,
  availableSlots = [],
  strategyMode = false,
  compassRotation = 0,
  cameraMode = "play",
  basePath = "",
  style,
  className,
  onReady,
  onError,
  onTileClick,
  onTileHover,
  onHoverLeave,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gameScene = new GameScene();
    sceneRef.current = gameScene;
    let cancelled = false;
    let settled = false;

    gameScene.init({ surface: createWebSurfaceAdapter(canvas), basePath }).then(
      () => {
        settled = true;
        // Unmounted while init was pending: free the scene, never start it.
        if (cancelled) {
          gameScene.dispose();
          return;
        }
        gameScene.onTileClick((gx, gy) => onTileClickRef.current?.(gx, gy));
        gameScene.onTileHover((gx, gy) => onTileHoverRef.current?.(gx, gy));
        gameScene.onHoverLeave(() => onHoverLeaveRef.current?.());
        gameScene.start();
        onReadyRef.current?.(gameScene);
      },
      (error: unknown) => {
        settled = true;
        gameScene.dispose();
        if (!cancelled) onErrorRef.current?.(error);
      },
    );

    return () => {
      cancelled = true;
      sceneRef.current = null;
      // While init is pending the scene is still being built: init's settlement disposes it.
      if (settled) gameScene.dispose();
    };
  }, [basePath]);

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

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", ...style }}
      className={className}
    />
  );
}
