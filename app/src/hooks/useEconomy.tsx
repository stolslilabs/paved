import { useDojo } from "@/dojo/useDojo";
import { useMemo } from "react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";

const FP = 1_000_000;

export const toEconomyView = (component: any) => {
  const multiplierFp =
    typeof component?.entry_multiplier_fp === "number"
      ? component.entry_multiplier_fp
      : FP;
  const supplySnapshot = BigInt(component?.entry_supply_snapshot ?? 0);
  const targetSnapshot = BigInt(component?.entry_target_snapshot ?? 0);

  return {
    multiplierFp,
    multiplier: multiplierFp / FP,
    supplySnapshot,
    targetSnapshot,
  };
};

export const useEconomy = ({
  gameId,
}: {
  gameId: number | undefined;
}): {
  multiplierFp: number;
  multiplier: number;
  supplySnapshot: bigint;
  targetSnapshot: bigint;
} => {
  const {
    setup: {
      clientModels: {
        models: { Game },
      },
    },
  } = useDojo();

  const gameKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId || 0)]) as Entity,
    [gameId],
  );
  const component = useComponentValue(Game, gameKey) as any;

  return useMemo(() => toEconomyView(component), [component]);
};
