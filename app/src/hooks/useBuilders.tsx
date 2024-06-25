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
  const [builders, setBuilders] = useState<any>({});

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
    const components = builderKeys.map((entity) => {
      const component = getComponentValue(Builder, entity);
      if (!component) {
        return undefined;
      }
      return new BuilderClass(component);
    });

    const objectified = components.reduce(
      (obj: any, builder: Builder | undefined) => {
        if (builder) {
          obj[builder.game_id] = builder;
        }
        return obj;
      },
      {},
    );

    setBuilders(objectified);
  }, [builderKeys]);

  return { builders: Object.values(builders) };
};
