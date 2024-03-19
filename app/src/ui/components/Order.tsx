import { useMemo } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useQueryParams } from "../../hooks/useQueryParams";
import { getOrder, getColor } from "../../utils";
import { useBuilder } from "@/hooks/useBuilder";

export const Order = () => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
  } = useDojo();

  const { builder } = useBuilder({
    gameId: gameId,
    playerId: account?.address,
  });
  const color = useMemo(() => {
    return getColor(account.address);
  }, [account]);

  return (
    <div className={`flex justify-center items-center`} style={{ color }}>
      {getOrder(builder?.order)}
    </div>
  );
};
