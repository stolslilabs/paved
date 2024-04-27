import { Games } from "@/ui/modules/Games";
import { Player } from "@/ui/modules/Player";
import banner from "/assets/banner.svg";
import { Links } from "../components/Links";
import { useState } from "react";
import { Button } from "../elements/button";

export const GameLobby = () => {
  const [sideBar, setSidebar] = useState<boolean>(false);

  return (
    <div className="h-screen flex w-full relative">
      <div className="absolute top-4 z-[100] left-4 flex md:hidden">
        <Button
          onClick={() => setSidebar(!sideBar)}
          variant={"default"}
          size={"icon"}
        >
          x
        </Button>
      </div>

      <div
        className={`${sideBar ? "w-screen" : "hidden"} z-10 md:w-1/3 bg-paved-pink px-4 border-r-4 border-paved-dark-blue absolute md:relative h-screen p-8`}
      >
        <div className="h-40 opacity-60 hidden md:block">
          <img src={banner} alt="banner" className="h-full " />
        </div>
        <Player />
        <Links />
      </div>
      <div className="w-full md:w-2/3 ">
        <Games />
      </div>
    </div>
  );
};
