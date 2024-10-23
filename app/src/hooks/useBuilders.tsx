import { useEffect, useState } from "react";
import { useDojo } from "@/dojo/useDojo";
import { getComponentValue, Has, HasValue } from "@dojoengine/recs";
import { useEntityQuery } from "@dojoengine/react";
import { Builder } from "@/dojo/game/models/builder";

export const useBuilders = ({
  gameId,
}: {
  gameId: number;
}): { builders: Builder[] } => {
  const [builders, setBuilders] = useState<Builder[]>([]);

  const {
    setup: {
      clientModels: {
        models: { Builder },
        classes: { Builder: BuilderClass },
      },
    },
  } = useDojo();

  const builderKeys = useEntityQuery([
    Has(Builder),
    HasValue(Builder, { game_id: gameId }),
  ]);

  useEffect(() => {
    const newBuilders = builderKeys
      .map((entity) => {
        const component = getComponentValue(Builder, entity);
        return component ? new BuilderClass(component) : undefined;
      })
      .filter((builder): builder is Builder => builder !== undefined);

    setBuilders(newBuilders);
  }, [builderKeys]);

  return { builders };
};