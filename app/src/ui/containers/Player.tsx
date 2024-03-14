import { useMemo } from "react";
import banner from "/assets/banner.svg";
import { PlayerCard } from "@/ui/components/PlayerCard";
import { useDojo } from "@/dojo/useDojo";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useLobbyStore } from "@/store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookBible } from "@fortawesome/free-solid-svg-icons";
import { faDiscord, faXTwitter } from "@fortawesome/free-brands-svg-icons";

export const Player = () => {
  const backgroundColor = useMemo(() => "#FFF8F8", []);
  const { playerEntity } = useLobbyStore();

  const {
    account: { account },
  } = useDojo();

  const playerId = useMemo(() => {
    if (playerEntity) {
      return playerEntity;
    }
    return getEntityIdFromKeys([BigInt(account.address)]) as Entity;
  }, [account, playerEntity]);

  return (
    <div className="h-full w-[600px] flex flex-col" style={{ backgroundColor }}>
      <div className="h-40 opacity-60">
        <img src={banner} alt="banner" className="h-full" />
      </div>
      <div className="px-10 flex flex-col justify-around grow">
        <PlayerCard playerId={playerId} />
        <div className="flex justify-around gap-4">
          <a
            className="flex justify-center items-center hover:scale-125 duration-200"
            href={"https://paved-doc.vercel.app/"}
            target="_blank"
          >
            <FontAwesomeIcon icon={faBookBible} className="h-12" />
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
