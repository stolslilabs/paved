import { useDojo } from "../../dojo/useDojo";
import { useGameStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFire } from "@fortawesome/free-solid-svg-icons";

interface TProps {}

export const Discard = (props: TProps) => {
  const { gameId } = useGameStore();
  const {
    account,
    setup: {
      client: { play },
    },
  } = useDojo();

  if (!account) return <></>;

  const handleClick = () => {
    play.discard({
      account: account.account,
      game_id: gameId,
    });
  };

  return (
    <div
      className="row-span-1 col-span-1 border-2 flex justify-center items-center bg-white cursor-pointer"
      onClick={handleClick}
    >
      <FontAwesomeIcon icon={faFire} />
    </div>
  );
};
