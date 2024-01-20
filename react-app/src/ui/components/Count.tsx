import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useGameStore } from "../../store";

export const Count = () => {
  const { gameId } = useGameStore();

  const {
    account: { account },
    setup: {
      clientComponents: { Builder },
    },
  } = useDojo();

  const builderId = getEntityIdFromKeys([
    BigInt(gameId),
    BigInt(account.address),
  ]) as Entity;
  const builder = useComponentValue(Builder, builderId);

  return (
    <div className="h-12 w-48 bg-white flex justify-center items-center border-2">
      {builder ? builder.tile_remaining : "NaN"}
    </div>
  );
};
