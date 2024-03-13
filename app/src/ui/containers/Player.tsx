import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import banner from "/assets/banner.svg";
import { PlayerCard } from "@/ui/components/PlayerCard";
import { Spawn } from "@/ui/components/Spawn";
import { useDojo } from "@/dojo/useDojo";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useLobbyStore } from "@/store";
import { Buy } from "../components/Buy";

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
    <div className="h-full w-[600px] flex-col" style={{ backgroundColor }}>
      <div className="h-40 opacity-60">
        <img src={banner} alt="banner" className="h-full" />
      </div>
      <div className="px-10 flex flex-col gap-4">
        <div className="flex justify-between gap-4">
          {/* <Buy buttonName={"Shop"} /> */}

          {/* <Spawn /> */}
        </div>
        <PlayerCard playerId={playerId} />
        <Button disabled variant={"secondary"} onClick={() => {}}>
          Guide
        </Button>
      </div>
    </div>
  );
};
