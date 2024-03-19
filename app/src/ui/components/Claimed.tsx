import { useDojo } from "../../dojo/useDojo";
import { useQueryParams } from "../../hooks/useQueryParams";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSackDollar } from "@fortawesome/free-solid-svg-icons";
import { useBuilder } from "@/hooks/useBuilder";

export const Claimed = () => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
  } = useDojo();

  const { builder } = useBuilder({
    gameId: gameId,
    playerId: account?.address,
  });

  return (
    <div className=" flex justify-center items-center text-l gap-2">
      <FontAwesomeIcon icon={faSackDollar} />
      {builder ? Number(builder.claimed / BigInt(1e12)) / 1000000 : "NaN"}
    </div>
  );
};
