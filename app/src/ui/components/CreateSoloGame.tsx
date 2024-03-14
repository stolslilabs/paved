import { useDojo } from "../../dojo/useDojo";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useComponentValue } from "@dojoengine/react";
import { useMemo } from "react";
import { shortString } from "starknet";

export const CreateSoloGame = () => {
  const {
    account: { account },
    setup: {
      clientComponents: { Player },
      systemCalls: { create_game },
    },
  } = useDojo();

  const playerId = useMemo(
    () => getEntityIdFromKeys([BigInt(account.address)]) as Entity,
    [account]
  );
  const player = useComponentValue(Player, playerId);

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
