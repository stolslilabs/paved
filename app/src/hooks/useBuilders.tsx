import { useEffect, useState } from "react";
import { useDojo } from "@/dojo/useDojo";
import { getComponentValue, Has, HasValue } from "@dojoengine/recs";
import { useEntityQuery } from "@dojoengine/react";

export const useBuilders = ({ gameId }: { gameId: number }) => {
  const [builders, setBuilders] = useState<any[]>([]);

  const {
    setup: {
      clientModels: {
        models: { Builder },
        classes: { Builder: BuilderClass },
      },
    },
  } = useDojo();

  const createBuilderAndSet = (builder: any) => {
    // Update the builders
    setBuilders([...builders, builder]);
  };

  const builderKeys = useEntityQuery([
    Has(Builder),
    HasValue(Builder, { game_id: gameId }),
  ]);

  useEffect(() => {
    builderKeys.forEach((entity) => {
      const builder = getComponentValue(Builder, entity);

      if (!builder) {
        return;
      }

      createBuilderAndSet(new BuilderClass(builder));
    });
  }, [builderKeys]);

  return { builders: Object.values(builders) };
};
