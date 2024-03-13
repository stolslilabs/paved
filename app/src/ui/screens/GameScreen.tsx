import { ThreeGrid } from "@/ui/components/Three";
import { Banner } from "@/ui/components/Banner";
import { Overlay } from "@/ui/modules/Overlay";
import { useMemo } from "react";
import { KeyboardControlsEntry, KeyboardControls } from "@react-three/drei";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useDojo } from "@/dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { Player } from "@/ui/containers/Player";
import { Room } from "@/ui/containers/Room";
import { Header } from "@/ui/containers/Header";

export enum Controls {
  clockwise = "clockwise",
  counterClockwise = "counterClockwise",
}

const GameRoom = () => {
  return (
    <div className="relative flex">
      <Header />
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
    []
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
  const {
    setup: {
      clientComponents: { Game },
    },
  } = useDojo();
  const gameKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId)]),
    [gameId]
  );
  const game = useComponentValue(Game, gameKey);

  return game?.start_time ? <GameScene /> : <GameRoom />;
}

export default GameScreen;
