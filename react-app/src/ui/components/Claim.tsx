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

export const Claim = () => {
  const { gameId } = useQueryParams();
  const [enable, setEnable] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const {
    account: { account },
    setup: {
      clientComponents: { Game, Builder },
      systemCalls: { claim },
    },
  } = useDojo();

  const gameEntity = getEntityIdFromKeys([BigInt(gameId)]) as Entity;
  const game = useComponentValue(Game, gameEntity);

  const builderId = getEntityIdFromKeys([
    BigInt(gameId),
    BigInt(account.address),
  ]) as Entity;
  const builder = useComponentValue(Builder, builderId);

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
    const interval = setInterval(() => {
      const now = Math.floor(Date.now()) / 1000;
      setEnable(
        (!claimed && game?.over) ||
          (!claimed &&
            game?.duration !== 0 &&
            now >= game?.start_time + game?.duration)
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [game, claimed]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={!enable}
            variant={"command"}
            size={"icon"}
            onClick={handleClick}
          >
            <FontAwesomeIcon className="h-4" icon={faSackDollar} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Claim</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
