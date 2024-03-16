import { useDojo } from "../../dojo/useDojo";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQueryParams } from "@/hooks/useQueryParams";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserXmark } from "@fortawesome/free-solid-svg-icons";

export const Kick = ({ player }: { player: any }) => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
    setup: {
      systemCalls: { kick_game },
    },
  } = useDojo();

  const handleClick = () => {
    if (!player) return;
    kick_game({
      account: account,
      game_id: gameId,
      player_id: player.id,
    });
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={"secondary"} size={"icon"} onClick={handleClick}>
            <FontAwesomeIcon icon={faUserXmark} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Kick player</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
