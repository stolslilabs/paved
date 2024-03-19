import { useDojo } from "../../dojo/useDojo";
import { useQueryParams } from "../../hooks/useQueryParams";
import { useBuilder } from "@/hooks/useBuilder";

export const Score = () => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
  } = useDojo();

  const { builder } = useBuilder({
    gameId: gameId,
    playerId: account?.address,
  });

  return (
    <div className=" flex justify-center items-center text-3xl">
      {builder ? builder.score : "NaN"}
    </div>
  );
};
