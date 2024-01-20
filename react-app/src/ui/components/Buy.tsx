import { Button } from "@/components/ui/button";
import { useDojo } from "../../dojo/useDojo";
import { useGameStore } from "../../store";
import { faCartPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const Buy = () => {
  const { gameId } = useGameStore();
  const {
    account,
    setup: {
      client: { play },
    },
  } = useDojo();

  return (
    <Button
      variant={"default"}
      onClick={() =>
        play.buy({
          account: account.account,
          game_id: gameId,
        })
      }
    >
      <FontAwesomeIcon icon={faCartPlus} />
    </Button>
  );
};
