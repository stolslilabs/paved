import { useDojo } from "../../dojo/useDojo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSquareCheck } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActions } from "@/hooks/useActions";

export const Confirm = () => {
  const {
    account: { account },
  } = useDojo();

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
            <FontAwesomeIcon className="h-12" icon={faSquareCheck} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Confirm selection</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
