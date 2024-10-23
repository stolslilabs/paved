import { useDojo } from "@/dojo/useDojo";
import { useCallback, useMemo } from "react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity, getComponentValue } from "@dojoengine/recs";
import { Builder } from "@/dojo/game/models/builder";

export const useBuilder = ({
  gameId,
  playerId,
}: {
  gameId?: number | undefined;
  playerId?: string | undefined;
}): { builder: Builder | null; builderKey: Entity, getBuilder: (gameId: number | null, playerId: string | null) => Builder | null } => {
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

  const getBuilder = useCallback((gameId: number | null, playerId: string | null) => {
    const builderKey = getEntityIdFromKeys([
      BigInt(gameId || 0),
      BigInt(playerId || 0),
    ])

    const component = getComponentValue(Builder, builderKey);

    return component ? new BuilderClass(component) : null
  }, [Builder, BuilderClass])

  return { builder, builderKey, getBuilder };
};
