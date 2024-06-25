import { ThreeGrid } from "@/ui/components/Three";
import { Banner } from "@/ui/components/Banner";
import { Overlay } from "@/ui/modules/Overlay";
import { useMemo } from "react";
import { KeyboardControlsEntry, KeyboardControls } from "@react-three/drei";
import { useUIStore } from "@/store";
import { Header } from "../containers/Header";

export enum Controls {
  clockwise = "clockwise",
  counterClockwise = "counterClockwise",
  strategyMode = "strategyMode",
}

const GameScene = () => {
  const map = useMemo<KeyboardControlsEntry<Controls>[]>(
    () => [
      { name: Controls.clockwise, keys: ["KeyW"] },
      { name: Controls.counterClockwise, keys: ["KeyQ"] },
      { name: Controls.strategyMode, keys: ["KeyE"] },
    ],
    [],
  );

  const loading = useUIStore((state) => state.loading);

  return (
    <div
      className={`relative w-full h-screen flex flex-col bg-blue-100 ${loading ? "cursor-wait" : ""} `}
    >
      <main className="flex flex-col left-0 relative top-0 overflow-hidden grow">
        <Header />
        <Banner />
        <Overlay />
        <div id="canvas-container" className="z-10 overflow-hidden grow">
          <KeyboardControls map={map}>
            <ThreeGrid />
          </KeyboardControls>
        </div>
      </main>
    </div>
  );
};

function GameScreen() {
  return <GameScene />;
}

export default GameScreen;
