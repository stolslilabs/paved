import { useDojo } from "@/dojo/useDojo";
import { useMemo } from "react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";

export const useTile = ({
  gameId,
  tileId,
}: {
  gameId: number;
  tileId: number;
}) => {
  const tileKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId), BigInt(tileId)]) as Entity,
    [gameId, tileId],
  );

  return useTileByKey({ tileKey });
};

export const useTileByKey = ({ tileKey }: { tileKey: Entity | undefined }) => {
  const {
    setup: {
      clientModels: {
        models: { Tile },
        classes: { Tile: TileClass },
      },
    },
  } = useDojo();

  const component = useComponentValue(Tile, tileKey);
  const tile = useMemo(() => {
    return component ? new TileClass(component) : null;
  }, [component]);

  return { tile, tileKey, model: component };
};
