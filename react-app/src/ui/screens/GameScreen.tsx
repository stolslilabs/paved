import { ThreeGrid } from "@/ui/components/Three";
import { Overlay } from "@/ui/modules/Overlay";
import { useMemo } from "react";
import { KeyboardControlsEntry, KeyboardControls } from "@react-three/drei";

export enum Controls {
  clockwise = "clockwise",
  counterClockwise = "counterClockwise",
}

function GameScreen() {
  const map = useMemo<KeyboardControlsEntry<Controls>[]>(
    () => [
      { name: Controls.clockwise, keys: ["KeyW"] },
      { name: Controls.counterClockwise, keys: ["KeyQ"] },
    ],
    []
  );

  const borderColor = useMemo(() => "#7D6669", []);

  return (
    <div
      className="relative w-screen h-screen flex flex-col border-8 rounded-lg"
      style={{ borderColor }}
    >
      <main className="flex flex-col left-0 relative top-0 overflow-hidden grow">
        <Overlay />
        <div
          id="canvas-container"
          className="z-10 left-0 relative top-0 overflow-hidden grow"
        >
          <KeyboardControls map={map}>
            <ThreeGrid />
          </KeyboardControls>
        </div>
      </main>
    </div>
  );
}

export default GameScreen;
