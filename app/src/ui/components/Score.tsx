import { useAccount } from "@starknet-react/core";
import { useDojo } from "../../dojo/useDojo";
import { useQueryParams } from "../../hooks/useQueryParams";
import { useBuilder } from "@/hooks/useBuilder";

export const Score = () => {
  const { gameId } = useQueryParams();
  const { account } = useAccount();

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
