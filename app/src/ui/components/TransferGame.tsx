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
import { useMemo } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrown, faStar } from "@fortawesome/free-solid-svg-icons";

export const TransferGame = ({ player }: { player: any }) => {
  const { gameId } = useQueryParams();

  const {
    account: { account },
    setup: {
      clientComponents: { Builder },
      systemCalls: { transfer_game },
    },
  } = useDojo();

  const builderKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId), BigInt(account.address)]),
    [gameId, account]
  );
  const builder = useComponentValue(Builder, builderKey);

  const disabled = useMemo(
    () => !player || builder?.index !== 0 || player.id === builder.player_id,
    [builder, player]
  );

  const handleClick = () => {
    if (!player) return;
    transfer_game({
      account: account,
      game_id: gameId,
      player_id: player.id,
    });
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={disabled}
            variant={"secondary"}
            size={"icon"}
            onClick={handleClick}
          >
            <FontAwesomeIcon icon={faCrown} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Transfer game host</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
