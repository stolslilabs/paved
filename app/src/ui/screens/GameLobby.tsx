import { Games } from "@/ui/modules/Games";
import { Player } from "@/ui/modules/Player";
import banner from "/assets/banner.svg";
import { Links } from "../components/Links";
import { useState } from "react";
import { Button } from "../elements/button";

export const GameLobby = () => {
  const [sideBar, setSidebar] = useState<boolean>(true);

  return (
    <div className="h-screen flex w-full relative">
      <div className="absolute top-4 z-[100] right-4 flex md:hidden">
        <Button
          onClick={() => setSidebar(!sideBar)}
          variant={"default"}
          size={"icon"}
        >
          x
        </Button>
      </div>

      <div
        className={`${sideBar ? "w-screen" : "hidden"} h-full z-10 md:w-1/3 border-r sticky bottom-0 h-screen px-8 shadow-2xl bg-primary-foreground`}
      >
        <div className="h-16 flex justify-center my-3">
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
