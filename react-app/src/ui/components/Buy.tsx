import { Button } from "@/components/ui/button";
import { useDojo } from "../../dojo/useDojo";
import { faCartPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryParams } from "@/hooks/useQueryParams";

export const Buy = () => {
  const { gameId } = useQueryParams();
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
