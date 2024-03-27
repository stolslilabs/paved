import { ThreeGrid } from "@/ui/components/Three";
import { Banner } from "@/ui/components/Banner";
import { Overlay } from "@/ui/modules/Overlay";
import { useMemo } from "react";
import { KeyboardControlsEntry, KeyboardControls } from "@react-three/drei";
import { useQueryParams } from "@/hooks/useQueryParams";
import { Player } from "@/ui/containers/Player";
import { Room } from "@/ui/containers/Room";
import { useGame } from "@/hooks/useGame";

export enum Controls {
  clockwise = "clockwise",
  counterClockwise = "counterClockwise",
}

const GameRoom = () => {
  return (
    <div className="h-full relative flex">
      <Player />
      <Room />
    </div>
  );
};

const GameScene = () => {
  const map = useMemo<KeyboardControlsEntry<Controls>[]>(
    () => [
      { name: Controls.clockwise, keys: ["KeyW"] },
      { name: Controls.counterClockwise, keys: ["KeyQ"] },
    ],
    [],
  );

  return (
    <div className="relative w-full h-full flex flex-col bg-[#E8DAE1]">
      <main className="flex flex-col left-0 relative top-0 overflow-hidden grow">
        <Banner />
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
};

function GameScreen() {
  const { gameId } = useQueryParams();
  const { game } = useGame({ gameId });
  return game?.start_time ? <GameScene /> : <GameRoom />;
}

export default GameScreen;
