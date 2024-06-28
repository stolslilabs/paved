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
import { useState } from "react";
import { Mode } from "@/dojo/game/types/mode";

export const CreateGame = ({ mode }: { mode: Mode }) => {
  const {
    account: { account },
    setup: {
      systemCalls: { create_game },
    },
  } = useDojo();

  const { player } = usePlayer({ playerId: account?.address });

  const [loading, setLoading] = useState<boolean>(false);

  const handleClick = async () => {
    if (!player) return;
    setLoading(true);
    await create_game({
      account: account as Account,
      mode: mode,
    });
    setLoading(false);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex justify-center items-center gap-0">
            <Button loading={loading} disabled={!player} onClick={handleClick}>
              New Game{" "}
              <span className="flex space-x-2 ml-1 sm:ml-4">
                [<p>1</p> <Lords height={4} width={4} fill={""} />]
              </span>
            </Button>
            {/* <div className="text-xs flex justify-center items-center gap-1 p-2rounded-r-lg bg-black p-2 text-white"></div> */}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Create a daily player game</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
