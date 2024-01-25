import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useGameStore } from "../../store";

export const Score = () => {
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
    <div className=" flex justify-center items-center text-3xl">
      {builder ? builder.score : "NaN"}
    </div>
  );
};
