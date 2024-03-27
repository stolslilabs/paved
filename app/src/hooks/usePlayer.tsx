import { useDojo } from "@/dojo/useDojo";
import { useMemo } from "react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";

export const usePlayer = ({ playerId }: { playerId: string }) => {
  const {
    setup: {
      clientModels: {
        models: { Player },
      },
    },
  } = useDojo();

  const playerKey = useMemo(
    () => getEntityIdFromKeys([BigInt(playerId)]) as Entity,
    [playerId],
  );
  const player = useComponentValue(Player, playerKey);

  return { player, playerKey };
};
