import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useMemo } from "react";

export const Count = () => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
    setup: {
      clientComponents: { Player, Builder },
    },
  } = useDojo();
  const playerKey = useMemo(
    () => getEntityIdFromKeys([BigInt(account.address)]) as Entity,
    [account]
  );
  const player = useComponentValue(Player, playerKey);
  const builderKey = useMemo(
    () =>
      getEntityIdFromKeys([BigInt(gameId), BigInt(account.address)]) as Entity,
    [gameId, account]
  );
  const builder = useComponentValue(Builder, builderKey);

  if (!player || !builder) return null;

  return (
    <div className=" flex justify-center items-center right-56 absolute bottom-0 text-4xl">
      {player.bank}
    </div>
  );
};
