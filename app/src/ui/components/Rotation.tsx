import { useGameStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMemo } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useBuilder } from "@/hooks/useBuilder";

export const Rotation = () => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
  } = useDojo();

  const { orientation, spot, setOrientation, rotateSpot } = useGameStore();
  const { builder } = useBuilder({
    gameId: gameId,
    playerId: account?.address,
  });

  const handleClick = () => {
    setOrientation(orientation + 1);
    rotateSpot(spot, true);
  };

  const disabled = useMemo(() => {
    return !builder?.tileId;
  }, [builder]);

  if (!account || !builder) return <></>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={disabled}
            variant={"command"}
            size={"command"}
            onClick={handleClick}
          >
            <FontAwesomeIcon className="h-12" icon={faRotateRight} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Clockwise rotation</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
