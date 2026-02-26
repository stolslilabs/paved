import { useEffect, useRef } from "react";
import { GameScene, type GameSceneDependencies } from "../core/GameScene";
import type {
  TileRenderData,
  CharacterRenderData,
  HoverState,
  CameraMode,
  RenderSurfaceAdapter,
  EffectsCapabilities,
} from "../core/types";

export interface GameCanvasNativeProps {
  surface: RenderSurfaceAdapter;
  tiles?: TileRenderData[];
  characters?: CharacterRenderData[];
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
  onTileClick?: (gridX: number, gridY: number) => void;
  onTileHover?: (gridX: number, gridY: number) => void;
  onHoverLeave?: () => void;
}

export function GameCanvasNative({
  surface,
  tiles = [],
  characters = [],
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
  onTileClick,
  onTileHover,
  onHoverLeave,
}: GameCanvasNativeProps) {
  const sceneRef = useRef<GameScene | null>(null);

  const onTileClickRef = useRef(onTileClick);
  const onTileHoverRef = useRef(onTileHover);
  const onHoverLeaveRef = useRef(onHoverLeave);

  useEffect(() => { onTileClickRef.current = onTileClick; }, [onTileClick]);
  useEffect(() => { onTileHoverRef.current = onTileHover; }, [onTileHover]);
  useEffect(() => { onHoverLeaveRef.current = onHoverLeave; }, [onHoverLeave]);

  useEffect(() => {
    const scene = new GameScene({ createRenderer, createCameraController });
    sceneRef.current = scene;

    scene.init({ surface, basePath, effectsCapabilities }).then(() => {
      scene.onTileClick((gx, gy) => onTileClickRef.current?.(gx, gy));
      scene.onTileHover((gx, gy) => onTileHoverRef.current?.(gx, gy));
      scene.onHoverLeave(() => onHoverLeaveRef.current?.());
      scene.start();
      onReady?.(scene);
    });

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [surface, basePath, createRenderer, createCameraController, effectsCapabilities]);

  useEffect(() => {
    sceneRef.current?.updateTiles(tiles);
  }, [tiles]);

  useEffect(() => {
    sceneRef.current?.updateCharacters(characters);
  }, [characters]);

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
