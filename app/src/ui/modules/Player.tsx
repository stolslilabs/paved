import { useMemo } from "react";
import { PlayerCard } from "@/ui/components/PlayerCard";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useLobbyStore } from "@/store";
import { useAccount } from "@starknet-react/core";

export const Player = () => {
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

  return <PlayerCard playerId={playerId} />;
};
