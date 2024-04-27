import { useDojo } from "../../dojo/useDojo";
import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { Account } from "starknet";
import { usePlayer } from "@/hooks/usePlayer";
import { Lords } from "./Lords";
import { useMemo } from "react";
import { useAccount } from "@starknet-react/core";

export const CreateGame = () => {
  const { account } = useAccount();
  const {
    setup: {
      systemCalls: { create_game },
    },
  } = useDojo();

  const { player } = usePlayer({ playerId: account?.address });

  const handleClick = () => {
    if (!player) return;
    create_game({
      account: account as Account,
    });
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex justify-center items-center space-x-3">
            <Button
              disabled={!player}
              variant={"secondary"}
              onClick={handleClick}
            >
              New Game
            </Button>
            <div className="text-xs flex justify-center items-center gap-1 p-2rounded-r-lg bg-black p-2 text-white">
              <p>1</p>
              <Lords height={4} width={4} fill={"white"} />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Create a weekly player game</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
