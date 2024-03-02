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
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useDojo } from "../../dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";

export const Rotation = () => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
    setup: {
      clientComponents: { Builder },
    },
  } = useDojo();

  const { orientation, setOrientation } = useGameStore();

  const builderId = getEntityIdFromKeys([
    BigInt(gameId),
    BigInt(account.address),
  ]) as Entity;
  const builder = useComponentValue(Builder, builderId);

  const handleClick = () => {
    setOrientation(orientation + 1);
  };

  const disabled = useMemo(() => {
    return !builder?.tile_id;
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
