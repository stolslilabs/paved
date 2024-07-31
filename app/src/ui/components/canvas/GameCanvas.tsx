import { KeyboardControls, KeyboardControlsEntry, useKeyboardControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { useHand } from "@/hooks/useHand";

enum Controls {
    clockwise = "clockwise",
    counterClockwise = "counterClockwise",
    strategyMode = "strategyMode",
}

type CanvasProps = { children: React.ReactNode };

export const GameCanvas = ({ children }: CanvasProps) => {
    const map = useMemo<KeyboardControlsEntry<Controls>[]>(
        () => [
            { name: Controls.clockwise, keys: ["KeyW"] },
            { name: Controls.counterClockwise, keys: ["KeyQ"] },
            { name: Controls.strategyMode, keys: ["KeyE"] },
        ], []);

    return (
        <KeyboardControls map={map}>
            <Canvas
                dpr={[0.5, 1]}
                shadows
                frameloop="demand"
            >
                {children}
                <Keyboard />
            </Canvas>
        </KeyboardControls>
    )
}

const Keyboard = () => {
    const { rotateHand, counterRotateHand, toggleStrategyMode } = useHand()

    const rotatePressed = useKeyboardControls<Controls>((state) => state.clockwise);
    const counterRotatePressed = useKeyboardControls<Controls>((state) => state.counterClockwise);
    const strategyModePressed = useKeyboardControls<Controls>((state) => state.strategyMode);

    if (rotatePressed) rotateHand();
    if (counterRotatePressed) counterRotateHand();
    if (strategyModePressed) toggleStrategyMode();

    return null
}

const Setup = ({ children }: { children: React.ReactNode }) => {
    return (
        <group>
            {children}
        </group>
    )
}

const Scene = ({ children }: { children: React.ReactNode }) => {
    return (
        <group>
            {children}
        </group>
    )
}

GameCanvas.Setup = Setup
GameCanvas.Scene = Scene