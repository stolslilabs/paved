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
import { useAccount } from "@starknet-react/core";
import { useActions } from "@/hooks/useActions";

export const Rotation = () => {
  const { account } = useAccount();
  const { enabled, builder } = useActions();

  const { orientation, spot, setOrientation, rotateSpot } = useGameStore();

  const handleClick = () => {
    setOrientation(orientation + 1);
    rotateSpot(spot, true);
  };

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
            <FontAwesomeIcon className="h-4 md:h-12" icon={faRotateRight} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Clockwise rotation</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
