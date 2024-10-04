import {
  KeyboardControls,
  KeyboardControlsEntry,
  useKeyboardControls,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { useHand } from "@/hooks/useHand";
import { useCameraStore } from "@/store";

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
    ],
    [],
  );

  return (
    <KeyboardControls map={map}>
      <Canvas dpr={[0.5, 1]} shadows frameloop="demand">
        {children}
        <Keyboard />
      </Canvas>
    </KeyboardControls>
  );
};

const Keyboard = () => {
  const [subscribeKeys] = useKeyboardControls<Controls>();
  const { rotateHand, counterRotateHand, toggleStrategyMode } = useHand();

  useEffect(() => {
    const unsubscribeRotate = subscribeKeys(
      (state) => state.clockwise,
      (value) => value && rotateHand(),
    );
    const unsubscribeCounterRotate = subscribeKeys(
      (state) => state.counterClockwise,
      (value) => value && counterRotateHand(),
    );
    const unsubscribeStrategyMode = subscribeKeys(
      (state) => state.strategyMode,
      (value) => value && toggleStrategyMode(),
    );

    return () => {
      unsubscribeRotate();
      unsubscribeCounterRotate();
      unsubscribeStrategyMode();
    };
  }, [counterRotateHand, rotateHand, subscribeKeys, toggleStrategyMode]);

  return null;
};

const Setup = ({ children }: { children: React.ReactNode }) => {
  return <group>{children}</group>;
};

const Scene = ({ children }: { children: React.ReactNode }) => {
  const { compassRotation } = useCameraStore(); // TODO: Fix this functionality to rotate camera instead

  return (
    <group rotation={[0, 0, compassRotation]} position={[0, 0, 0]}>
      {children}
    </group>
  );
};

GameCanvas.Setup = Setup;
GameCanvas.Scene = Scene;
