import { useDojo } from "../../dojo/useDojo";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shortString } from "starknet";
import { usePlayer } from "@/hooks/usePlayer";

export const CreateSoloGame = () => {
  const {
    account: { account },
    setup: {
      systemCalls: { create_game },
    },
  } = useDojo();

  const { player } = usePlayer({ playerId: account?.address });

  const handleClick = () => {
    if (!player) return;
    create_game({
      account: account,
      name: shortString.encodeShortString("Solo"),
      duration: 0,
      mode: 1,
    });
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={!player}
            variant={"secondary"}
            onClick={handleClick}
          >
            New Game
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Create a single player game</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
