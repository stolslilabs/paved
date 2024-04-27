import { useDojo } from "../../dojo/useDojo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquareCheck } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { useActions } from "@/hooks/useActions";
import { useAccount } from "@starknet-react/core";

export const Confirm = () => {
  const { account } = useAccount();

  const { handleClick, disabled, builder } = useActions();

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
            <FontAwesomeIcon className="h-4 md:h-12" icon={faSquareCheck} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Confirm selection</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
