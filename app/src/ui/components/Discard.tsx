import { useMemo } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFire } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { useBuilder } from "@/hooks/useBuilder";
import { Account } from "starknet";
import { useAccount } from "@starknet-react/core";
import { useActions } from "@/hooks/useActions";
import { useGame } from "@/hooks/useGame";

export const Discard = () => {
  const { gameId } = useQueryParams();
  // const { account } = useAccount();
  const { enabled } = useActions();
  const {
    account: { account },
    setup: {
      systemCalls: { discard },
    },
  } = useDojo();

  const { game } = useGame({ gameId });

  const { builder } = useBuilder({
    gameId: gameId,
    playerId: account?.address,
  });

  if (!account || !game || !builder) return <></>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={!enabled}
            variant={"command"}
            size={"command"}
            onClick={() =>
              discard({
                account: account as Account,
                mode: game.mode,
                game_id: gameId,
              })
            }
          >
            <FontAwesomeIcon className="h-4 md:h-8" icon={faFire} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Discard tile</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
