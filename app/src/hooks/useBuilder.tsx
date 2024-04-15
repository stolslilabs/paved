import { useDojo } from "@/dojo/useDojo";
import { useMemo } from "react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";

export const useBuilder = ({
  gameId,
  playerId,
}: {
  gameId: number | undefined;
  playerId: string | undefined;
}) => {
  const {
    setup: {
      clientModels: {
        models: { Builder },
        classes: { Builder: BuilderClass },
      },
    },
  } = useDojo();

  const builderKey = useMemo(
    () =>
      getEntityIdFromKeys([
        BigInt(gameId || 0),
        BigInt(playerId || 0),
      ]) as Entity,
    [gameId, playerId],
  );
  const component = useComponentValue(Builder, builderKey);
  const builder = useMemo(() => {
    return component ? new BuilderClass(component) : null;
  }, [component]);

  return { builder, builderKey };
};
