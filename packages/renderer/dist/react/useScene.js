import { useRef, useEffect, useState } from "react";
import { GameScene } from "../core/GameScene";
export function useScene(config) {
    const canvasRef = useRef(null);
    const sceneRef = useRef(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        const scene = new GameScene();
        sceneRef.current = scene;
        scene.init({ canvas, ...config }).then(() => {
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
//# sourceMappingURL=useScene.js.map