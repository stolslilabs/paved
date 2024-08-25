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
import { useState } from "react";
import { Mode, ModeType } from "@/dojo/game/types/mode";
import { useLobby } from "@/hooks/useLobby";

export const CreateGame = ({ mode }: { mode: Mode }) => {
  const {
    account: { account },
    setup: {
      systemCalls: { create_game },
    },
  } = useDojo();

  const { gameMode } = useLobby();

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
          <Button className="tracking-[0.25rem] shadow-lg hover:bg-secondary px-4 py-5 lg:p-6" loading={loading} disabled={!player} onClick={handleClick}>
            {gameMode.value === ModeType.Tutorial ? "Start" : "New Game"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Create a {gameMode.value} player game</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
