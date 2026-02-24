import { useRef, useEffect } from "react";
import { GameScene } from "../core/GameScene";
import type { TileRenderData, CharacterRenderData, HoverState } from "../core/types";

export interface GameCanvasProps {
  tiles?: TileRenderData[];
  characters?: CharacterRenderData[];
  hover?: HoverState | null;
  availableSlots?: Array<{ x: number; y: number }>;
  strategyMode?: boolean;
  compassRotation?: number;
  basePath?: string;
  style?: React.CSSProperties;
  className?: string;
  onReady?: (scene: GameScene) => void;
  onTileClick?: (gridX: number, gridY: number) => void;
  onTileHover?: (gridX: number, gridY: number) => void;
  onHoverLeave?: () => void;
}

export function GameCanvas({
  tiles = [],
  characters = [],
  hover = null,
  availableSlots = [],
  strategyMode = false,
  compassRotation = 0,
  basePath = "",
  style,
  className,
  onReady,
  onTileClick,
  onTileHover,
  onHoverLeave,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GameScene | null>(null);

  const onTileClickRef = useRef(onTileClick);
  const onTileHoverRef = useRef(onTileHover);
  const onHoverLeaveRef = useRef(onHoverLeave);

  useEffect(() => { onTileClickRef.current = onTileClick; }, [onTileClick]);
  useEffect(() => { onTileHoverRef.current = onTileHover; }, [onTileHover]);
  useEffect(() => { onHoverLeaveRef.current = onHoverLeave; }, [onHoverLeave]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gameScene = new GameScene();
    sceneRef.current = gameScene;

    gameScene.init({ canvas, basePath }).then(() => {
      gameScene.onTileClick((gx, gy) => onTileClickRef.current?.(gx, gy));
      gameScene.onTileHover((gx, gy) => onTileHoverRef.current?.(gx, gy));
      gameScene.onHoverLeave(() => onHoverLeaveRef.current?.());
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
    sceneRef.current?.setAvailableSlots(availableSlots);
  }, [availableSlots]);

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
