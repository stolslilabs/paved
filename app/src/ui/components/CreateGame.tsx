import { useDojo } from "../../dojo/useDojo";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { usePlayer } from "@/hooks/usePlayer";
import { useState } from "react";
import { Mode, ModeType } from "@/dojo/game/types/mode";
import { useLobby } from "@/hooks/useLobby";
import { Button } from "../elements/button";
import { DuelDialog } from "./dom/dialogs/duels/DuelDialog";

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
      account: account,
      mode: mode,
    });
    if (gameMode.value === ModeType.Tutorial) return;
    setLoading(false);
  };

  return player && (
    <Tooltip>
      <TooltipTrigger asChild>
        {gameMode.value === ModeType.Duel ? (
          <DuelDialog playerName={player?.name} />
        ) : (
          <Button
            className="tracking-[0.25rem] self-center shadow-lg hover:bg-secondary text-xs lg:text-sm px-4 py-4 lg:p-6"
            loading={loading}
            disabled={!player || loading}
            onClick={handleClick}
          >
            {gameMode.value === ModeType.Tutorial ? "Start" : "New Game"}
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent>
        <p className="select-none">Create a {gameMode.value} player game</p>
      </TooltipContent>
    </Tooltip>
  );
};
