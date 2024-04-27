import { useMemo } from "react";
import banner from "/assets/banner.svg";
import { PlayerCard } from "@/ui/components/PlayerCard";
import { useDojo } from "@/dojo/useDojo";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useLobbyStore } from "@/store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookBible } from "@fortawesome/free-solid-svg-icons";
import {
  faDiscord,
  faXTwitter,
  faYoutube,
} from "@fortawesome/free-brands-svg-icons";
import { useAccount } from "@starknet-react/core";

export const Player = () => {
  const backgroundColor = useMemo(() => "#FFF8F8", []);
  const { playerEntity } = useLobbyStore();
  const { account } = useAccount();

  const playerId = useMemo(() => {
    if (playerEntity) {
      return playerEntity;
    }
    return getEntityIdFromKeys([
      BigInt(account ? account.address : 0),
    ]) as Entity;
  }, [account, playerEntity]);

  return (
    <div
      className="h-full md:w-[600px]  flex-col hidden md:flex"
      style={{ backgroundColor }}
    >
      <div className="h-40 opacity-60">
        <img src={banner} alt="banner" className="h-full" />
      </div>
      <div className="px-10 flex flex-col justify-around grow">
        <PlayerCard playerId={playerId} />
        <div className="flex justify-around gap-4">
          <a
            className="flex justify-center items-center hover:scale-125 duration-200"
            href={"https://docs.paved.gg/"}
            target="_blank"
          >
            <FontAwesomeIcon icon={faBookBible} className="h-12" />
          </a>
          <a
            className="flex justify-center items-center hover:scale-125 duration-200"
            href={"https://www.youtube.com/watch?v=_MgR12TISUY"}
            target="_blank"
          >
            <FontAwesomeIcon icon={faYoutube} className="h-12" />
          </a>
          <a
            className="flex justify-center items-center hover:scale-125 duration-200"
            href={"https://twitter.com/pavedgame"}
            target="_blank"
          >
            <FontAwesomeIcon icon={faXTwitter} className="h-12" />
          </a>
          <a
            className="flex justify-center items-center hover:scale-125 duration-200"
            href={"https://discord.gg/DXz9xEm5"}
            target="_blank"
          >
            <FontAwesomeIcon icon={faDiscord} className="h-12" />
          </a>
        </div>
      </div>
    </div>
  );
};
