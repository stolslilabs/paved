import { Tile } from "../components/Tile";
import { Rotation } from "../components/Rotation";
import { Discard } from "../components/Discard";
import { Confirm } from "../components/Confirm";
import { Button } from "@/components/ui/button";
import { useDojo } from "@/dojo/useDojo";
import { useGameStore } from "@/store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFire } from "@fortawesome/free-solid-svg-icons";

export const Hand = () => {
  const { gameId } = useGameStore();
  const {
    account,
    setup: {
      client: { play },
    },
  } = useDojo();
  return (
    <div className="absolute right-6 bottom-24 z-20 w-64 h-64">
      <div className="flex top-3 right-0 absolute justify-between space-x-1">
        <Button variant={"default"}>X</Button>
        <Confirm />
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
        <Rotation />
      </div>
      <Tile />
    </div>
  );
};
