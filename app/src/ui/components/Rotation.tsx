import { useGameStore } from "../../store";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { useAccount } from "@starknet-react/core";
import { useActions } from "@/hooks/useActions";
import { useDojo } from "@/dojo/useDojo";
import useSound from "use-sound";
import RotationSound from "/sounds/rotation.wav";
import icon from "/assets/icons/ROTATE.svg";

export const Rotation = () => {
  // const { account } = useAccount();
  const [play, { stop }] = useSound(RotationSound);
  const {
    account: { account },
  } = useDojo();
  const { enabled, builder } = useActions();

  const { orientation, spot, setOrientation, rotateSpot } = useGameStore();

  const handleClick = () => {
    play();
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
            <img src={icon} className="h-4 lg:h-8  fill-current" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Clockwise rotation</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
