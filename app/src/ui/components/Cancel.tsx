import { useCallback, useMemo } from "react";
import { useGameStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useBuilder } from "@/hooks/useBuilder";
import { useAccount } from "@starknet-react/core";
import { useActions } from "@/hooks/useActions";

export const Cancel = () => {
  const { gameId } = useQueryParams();
  const { account } = useAccount();
  const { enabled } = useActions();

  const {
    resetX,
    resetY,
    resetOrientation,
    resetCharacter,
    resetSpot,
    resetSelectedTile,
    resetHoveredTile,
    resetValid,
  } = useGameStore();

  const { builder } = useBuilder({ gameId, playerId: account?.address });

  const handleClick = useCallback(() => {
    resetOrientation();
    resetX();
    resetY();
    resetCharacter();
    resetSpot();
    resetSelectedTile();
    resetHoveredTile();
    resetValid();
  }, []);

  if (!account || !builder) return <></>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={!enabled}
            variant={"command"}
            size={"command"}
            onClick={handleClick}
          >
            <FontAwesomeIcon className="h-4 md:h-12" icon={faXmark} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Cancel selection</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
