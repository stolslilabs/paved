import { useState, useEffect } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSackDollar } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { useQueryParams } from "@/hooks/useQueryParams";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGame } from "@/hooks/useGame";
import { useBuilder } from "@/hooks/useBuilder";

export const Claim = () => {
  const { gameId } = useQueryParams();
  const [enable, setEnable] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const {
    account: { account },
    setup: {
      systemCalls: { claim },
    },
  } = useDojo();

  const { game } = useGame({ gameId });
  const { builder } = useBuilder({
    gameId: gameId,
    playerId: account?.address,
  });

  const handleClick = () => {
    if (account) {
      claim({
        account: account,
        game_id: gameId,
      });
    }
  };
  useEffect(() => {
    if (builder) {
      setClaimed(builder.claimed > 0n);
    }
  }, [builder]);

  useEffect(() => {
    if (!game) return;
    const interval = setInterval(() => {
      setEnable(!claimed && game.isOver());
    }, 1000);
    return () => clearInterval(interval);
  }, [game, claimed]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={!enable}
            variant={"default"}
            size={"icon"}
            onClick={handleClick}
          >
            <FontAwesomeIcon icon={faSackDollar} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Claim</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
