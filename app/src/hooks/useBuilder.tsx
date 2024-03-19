import { useDojo } from "@/dojo/useDojo";
import { useMemo } from "react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";

export const useBuilder = ({
  gameId,
  playerId,
}: {
  gameId: number;
  playerId: string;
}) => {
  const {
    setup: {
      clientModels: {
        models: { Builder },
      },
    },
  } = useDojo();

  const builderKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId), BigInt(playerId)]) as Entity,
    [gameId, playerId]
  );
  const builder = useComponentValue(Builder, builderKey);

  return { builder, builderKey };
};
