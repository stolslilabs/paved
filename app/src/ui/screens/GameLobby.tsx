import { Games } from "@/ui/modules/Games";
import { Player } from "@/ui/modules/Player";
import { Links } from "../components/Links";
import { useState } from "react";
import { Button } from "../elements/button";
import { Tournament } from "../components/Tournament";
import { useLobby } from "@/hooks/useLobby";
import BoxRainScene from "../modules/BoxRain";
import { Address } from "../components/Address";
import { isMobile } from "react-device-detect";

export const GameLobby = () => {
  const [sideBar, setSidebar] = useState<boolean>(true);

  const { gameMode } = useLobby();

  return (
    <div className="h-dscreen flex w-full relative">
      <div className="absolute h-full w-full z-0">
        <BoxRainScene />
      </div>
      {!isMobile && (
        <div className="absolute top-4 z-[100] right-4 flex md:hidden">
          <Button
            onClick={() => setSidebar(!sideBar)}
            variant={"default"}
            size={"icon"}
          >
            x
          </Button>
        </div>
      )}

      <div className="w-full md:w-10/12 bg-white/90 z-10">
        <Games />
      </div>
      {!isMobile && (
        <div
          className={`${sideBar ? "w-screen" : "hidden"} z-10 md:w-1/3 border-r sticky bottom-0 h-dscreen p-8 shadow-2xl bg-primary overflow-auto `}
        >
          <div className="mb-2">
            <Address />
          </div>

          <Player />

          <div className="my-4 py-4 border shadow-sm bg-white/90">
            <Tournament mode={gameMode} />
          </div>
          <Links />
        </div>
      )}
    </div>
  );
};
