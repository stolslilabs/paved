import { useCallback, useEffect, useRef } from "react";
import {
  type TileRenderData,
  type CharacterRenderData,
  type HoverState,
  type CameraMode,
  type RenderSurfaceAdapter,
  type EffectsCapabilities,
  type GameSceneDependencies,
  type GameScene,
} from "@paved/renderer";
import { GameCanvasNative } from "@paved/renderer/react-native";

export interface GameScreenProps {
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
  resumeToken?: number;
  createRenderer?: GameSceneDependencies["createRenderer"];
  createCameraController?: GameSceneDependencies["createCameraController"];
  onSelectTile?: (coords: { x: number; y: number }) => void;
}

export function GameScreen({
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
  resumeToken = 0,
  createRenderer,
  createCameraController,
  onSelectTile,
}: GameScreenProps) {
  const sceneRef = useRef<GameScene | null>(null);

  const handleTileClick = useCallback((x: number, y: number) => {
    onSelectTile?.({ x, y });
  }, [onSelectTile]);

  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.requestRender();
  }, [resumeToken]);

  return (
    <GameCanvasNative
      surface={surface}
      tiles={tiles}
      characters={characters}
      hover={hover}
      availableSlots={availableSlots}
      strategyMode={strategyMode}
      compassRotation={compassRotation}
      cameraMode={cameraMode}
      basePath={basePath}
      effectsCapabilities={effectsCapabilities}
      createRenderer={createRenderer}
      createCameraController={createCameraController}
      onReady={(scene) => {
        sceneRef.current = scene;
      }}
      onTileClick={handleTileClick}
    />
  );
}
