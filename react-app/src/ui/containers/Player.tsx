import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import banner from "/assets/banner.svg";
import { Account } from "@/ui/components/Account";
import { PlayerCard } from "@/ui/components/PlayerCard";
import { Spawn } from "@/ui/components/Spawn";
import { useDojo } from "@/dojo/useDojo";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useLobbyStore } from "@/store";

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
        <h1 className="text-2xl text-left">Menu</h1>
        <Account />
        <div className="flex justify-between gap-4">
          <Button disabled variant={"secondary"} onClick={() => {}}>
            Shop
          </Button>
          <Button disabled variant={"secondary"} onClick={() => {}}>
            Guide
          </Button>
          <Spawn />
        </div>
        <PlayerCard playerId={playerId} />
      </div>
    </div>
  );
};
