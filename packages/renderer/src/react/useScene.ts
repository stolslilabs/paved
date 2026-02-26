import { useRef, useEffect, useState } from "react";
import { GameScene } from "../core/GameScene";
import { createWebSurfaceAdapter } from "../core/WebSurfaceAdapter";
import type { RendererConfig } from "../core/types";

export function useScene(config?: Partial<RendererConfig>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new GameScene();
    sceneRef.current = scene;

    scene.init({ surface: createWebSurfaceAdapter(canvas), ...config }).then(() => {
      scene.start();
      setReady(true);
    });

    return () => {
      scene.dispose();
      sceneRef.current = null;
      setReady(false);
    };
  }, []);

  return { canvasRef, scene: sceneRef.current, ready };
}
