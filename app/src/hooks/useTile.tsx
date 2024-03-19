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
  const {
    setup: {
      clientModels: {
        models: { Tile },
        classes: { Tile: TileClass },
      },
    },
  } = useDojo();

  const tileKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId), BigInt(tileId)]) as Entity,
    [gameId, tileId]
  );
  const component = useComponentValue(Tile, tileKey);
  const tile = useMemo(() => {
    return component ? new TileClass(component) : null;
  }, [component]);

  return { tile, tileKey, model: component };
};
