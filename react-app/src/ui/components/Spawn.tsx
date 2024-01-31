import { useDojo } from "../../dojo/useDojo";
import { shortString } from "starknet";
import { Button } from "@/components/ui/button";
import { useQueryParams } from "@/hooks/useQueryParams";

export const Spawn = () => {
  const { gameId } = useQueryParams();
  const {
    account,
    setup: {
      client: { play },
    },
  } = useDojo();

  const handleClick = () => {
    play.spawn({
      account: account.account,
      game_id: gameId,
      name: shortString.encodeShortString(name),
      order: order,
    });
  };

  const name = "OHAYO";
  const order = 1;

  return (
    <div className="flex space-x-3 justify-between p-2 flex-wrap">
      <Button variant={"default"} onClick={handleClick}>
        Spawn
      </Button>
    </div>
  );
};
