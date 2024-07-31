import { useUIStore } from "@/store";
import { Overlay } from "../components/dom/Overlay";
import { GameCanvas } from "../components/canvas/GameCanvas";
import { ScreenshotCube } from "../components/canvas/ScreenshotCube";
import { Rig } from "../components/canvas/Rig";
import { Lighting } from "../components/canvas/Lighting";
import { Postprocessing } from "../components/canvas/Postprocessing";
import { TileTextures } from "../components/TileTextures";
import { CharTextures } from "../components/CharTextures";
import { IngameStatus } from "../components/dom/IngameStatus";
import { NavigationMenu } from "../components/dom/NavigationMenu/NavigationMenu";
import { CharacterMenu } from "../components/dom/CharacterMenu";
import { HandPanel } from "../components/dom/HandPanel";

const GameScreen = () => {
  const loading = useUIStore((state) => state.loading);

  return (
    <main className={`relative w-full h-dscreen flex flex-col left-0 top-0 overflow-hidden grow bg-blue-100 ${loading && "cursor-wait"}`}>
      <Overlay>
        <Overlay.Header />
        <Overlay.Banner />
        <Overlay.Content>
          <NavigationMenu />
          <IngameStatus />
          <CharacterMenu />
          <HandPanel />
        </Overlay.Content>
      </Overlay>
      <GameCanvas>
        <ScreenshotCube />
        <GameCanvas.Scene>
          <TileTextures squareSize={3} />
          <CharTextures radius={0.3} height={1.5} squareSize={3} />
        </GameCanvas.Scene>
        <GameCanvas.Setup>
          <Rig />
          <Lighting />
          <Postprocessing />
        </GameCanvas.Setup>
      </GameCanvas>
    </main>
  );
};

export default GameScreen;
