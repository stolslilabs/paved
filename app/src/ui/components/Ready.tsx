import { useDojo } from "../../dojo/useDojo";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useGame } from "@/hooks/useGame";
import { ComponentValue } from "@dojoengine/recs";

export const Ready = ({ builder }: { builder: ComponentValue }) => {
  const { gameId } = useQueryParams();
  const [status, setStatus] = useState<boolean>();

  const {
    account: { account },
    setup: {
      systemCalls: { ready_game },
    },
  } = useDojo();

  const { game } = useGame({ gameId });

  useEffect(() => {
    if (!game) return;
    setStatus(
      BigInt(game.players) & (BigInt(1) << BigInt(builder.index))
        ? true
        : false,
    );
  }, [game, builder]);

  const handleClick = () => {
    ready_game({
      account: account,
      game_id: gameId,
      status: !status ? 1 : 0,
    });
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={"secondary"} size={"icon"} onClick={handleClick}>
            {!status && <FontAwesomeIcon icon={faCheck} />}
            {status && <FontAwesomeIcon icon={faXmark} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {!status && <p className="select-none">Ready</p>}
          {status && <p className="select-none">Not Ready</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
