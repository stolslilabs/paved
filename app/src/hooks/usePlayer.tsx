import { useDojo } from "@/dojo/useDojo";
import { useMemo } from "react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";

export const usePlayer = ({ playerId }: { playerId: string | undefined }) => {
  const playerKey = useMemo(
    () => getEntityIdFromKeys([BigInt(playerId || 0)]) as Entity,
    [playerId]
  );

  return usePlayerByKey({ playerKey });
};

export const usePlayerByKey = ({
  playerKey,
}: {
  playerKey: Entity | undefined;
}) => {
  const {
    setup: {
      clientModels: {
        models: { Player },
        classes: { Player: PlayerClass },
      },
    },
  } = useDojo();

  const component = useComponentValue(Player, playerKey);

  const player = useMemo(() => {
    return component ? new PlayerClass(component) : null;
  }, [component]);

  return { player, playerKey, model: component };
};
