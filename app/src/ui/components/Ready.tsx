import { useDojo } from "../../dojo/useDojo";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { useEffect, useMemo, useState } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";

export const Ready = ({ builder }: { builder: any }) => {
  const { gameId } = useQueryParams();
  const [status, setStatus] = useState<boolean>();

  const {
    account: { account },
    setup: {
      clientComponents: { Game },
      systemCalls: { ready_game },
    },
  } = useDojo();

  const gameKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId)]),
    [gameId]
  );
  const game = useComponentValue(Game, gameKey);

  useEffect(() => {
    setStatus(game?.status === builder?.status);
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
