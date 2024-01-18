import { useDojo } from "../../dojo/useDojo";
import { useGameStore } from "../../store";
import { faCartPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface TProps {}

export const Buy = (props: TProps) => {
  const { gameId } = useGameStore();
  const {
    account,
    setup: {
      client: { play },
    },
  } = useDojo();

  if (!account) return <></>;

  const handleClick = () => {
    play.buy({
      account: account.account,
      game_id: gameId,
    });
  };

  return (
    <div
      className="h-16 w-16 border-2 flex justify-center items-center bg-white cursor-pointer"
      onClick={handleClick}
    >
      <FontAwesomeIcon icon={faCartPlus} />
    </div>
  );
};
