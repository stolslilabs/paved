import { useRef, useEffect } from "react";
import { GameScene } from "../core/GameScene";
import type { TileRenderData, CharacterRenderData, HoverState } from "../core/types";

export interface GameCanvasProps {
  tiles?: TileRenderData[];
  characters?: CharacterRenderData[];
  hover?: HoverState | null;
  strategyMode?: boolean;
  compassRotation?: number;
  basePath?: string;
  style?: React.CSSProperties;
  className?: string;
  onReady?: (scene: GameScene) => void;
}

export function GameCanvas({
  tiles = [],
  characters = [],
  hover = null,
  strategyMode = false,
  compassRotation = 0,
  basePath = "",
  style,
  className,
  onReady,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GameScene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gameScene = new GameScene();
    sceneRef.current = gameScene;

    gameScene.init({ canvas, basePath }).then(() => {
      gameScene.start();
      onReady?.(gameScene);
    });

    return () => {
      gameScene.dispose();
      sceneRef.current = null;
    };
  }, [basePath]);

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
    sceneRef.current?.setStrategyMode(strategyMode);
  }, [strategyMode]);

  useEffect(() => {
    sceneRef.current?.setCompassRotation(compassRotation);
  }, [compassRotation]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", ...style }}
      className={className}
    />
  );
}
