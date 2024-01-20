import { useDojo } from "../../dojo/useDojo";
import { useGameStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxOpen } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";

interface TProps {}

export const Collect = (props: TProps) => {
  const { gameId, character, setCharacter } =
    useGameStore();

  const {
    account: { account },
    setup: {
      client: { play },
    },
  } = useDojo();

  const handleClick = () => {
    play.collect({
      account: account,
      game_id: gameId,
      role: character,
    });

    // Reset the settings
    setCharacter(0);
  };

  return (
    <Button variant={"default"} onClick={handleClick}>
      <FontAwesomeIcon icon={faBoxOpen} />
    </Button>
  );
};
