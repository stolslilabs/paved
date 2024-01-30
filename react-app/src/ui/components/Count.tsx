import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useQueryParams } from "@/hooks/useQueryParams";

export const Count = () => {
  const { gameId } = useQueryParams();

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
    <div className=" flex justify-center items-center right-56 absolute bottom-0 text-4xl">
      {builder ? builder.tile_remaining : "NaN"}
    </div>
  );
};
