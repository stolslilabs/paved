import { Suspense, lazy, useMemo, useState } from "react";
import { freeInventory } from "@paved/game-core";
import type { GameScene, RendererSettingsInput } from "@paved/renderer";
import VillageStage, { type VillageStageProps } from "../components/containers/village-stage";
import { useBoardSkins } from "../data/board-skins";
import type { FreeVillageHeld } from "../data/free-village-base";
import { RENDERER_ASSETS } from "../data/renderer-manifest";
import { useDeviceSettings } from "../data/settings";
import { hasWebGL } from "../lib/webgl";
import { countsByPlan, useVillageArt } from "./village-v2";

/** The 3D village, its own chunk (the renderer's), after the stage. */
const HomeCanvas = lazy(() => import("./home-canvas"));

export interface HomeStageProps extends VillageStageProps {
  /** Whose village: its tiles drawn in their skins. */
  playerId: string | null;
  /** The village and the tiles held: the inventory's free tiles are counted here, with the engine (game-core's rule). */
  held?: FreeVillageHeld | null;
  /** The renderer's settings and the scene's handle (`useBoardSettings`: the season wheel reads the cycle from it). */
  settings?: RendererSettingsInput;
  onScene?: (scene: GameScene | null) => void;
}

/**
 * The home's village stage as the app wires it (#753), its own chunk: the stage (the editor, the board, the engine) with the
 * tile art in the owner's skins and the 3D scene under it; the plan view under the low graphics quality, where WebGL is missing
 * or where the renderer cannot start.
 */
export default function HomeStage({ playerId, held, settings, onScene, ...stage }: HomeStageProps) {
  const inventory = useMemo(() => (held ? countsByPlan(freeInventory(held.inventory, held.tiles)) : stage.inventory), [held, stage.inventory]);
  const tileArt = useVillageArt(playerId);
  const skins = useBoardSkins(playerId);
  // The plan view under reduced quality (the Graphics quality setting at "low", followed as it changes), where WebGL is
  // missing, or once the renderer failed.
  const [{ quality }] = useDeviceSettings();
  const [failed, setFailed] = useState(() => !hasWebGL());
  const view = failed || quality === "low" ? "plan" : "3d";
  return (
    <VillageStage
      {...stage}
      inventory={inventory}
      tileArt={tileArt}
      renderCanvas={
        view === "3d"
          ? (v) => (
              <Suspense fallback={null}>
                <HomeCanvas view={v} basePath={RENDERER_ASSETS} skins={skins} settings={settings} onScene={onScene} onError={() => setFailed(true)} />
              </Suspense>
            )
          : undefined
      }
    />
  );
}
