import { useDojo } from "../../dojo/useDojo";
import { useGameStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFire } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";

interface TProps {}

export const Discard = (props: TProps) => {
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
        play.discard({
          account: account.account,
          game_id: gameId,
        })
      }
    >
      <FontAwesomeIcon icon={faFire} />
    </Button>
  );
};
