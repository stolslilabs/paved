import { jsx as _jsx } from "react/jsx-runtime";
import { useRef, useEffect } from "react";
import { GameScene } from "../core/GameScene";
export function GameCanvas({ tiles = [], characters = [], hover = null, strategyMode = false, compassRotation = 0, basePath = "", style, className, onReady, }) {
    const canvasRef = useRef(null);
    const sceneRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas)
            return;
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
    return (_jsx("canvas", { ref: canvasRef, style: { width: "100%", height: "100%", ...style }, className: className }));
}
//# sourceMappingURL=GameCanvas.js.map