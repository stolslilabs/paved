import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDojo } from "../../dojo/useDojo";
import { faCartPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const Buy = () => {
  const {
    account: { account },
    setup: {
      systemCalls: { buy },
    },
  } = useDojo();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={"command"}
            size={"command"}
            onClick={() =>
              buy({
                account: account,
                amount: 1,
              })
            }
          >
            <FontAwesomeIcon className="h-12" icon={faCartPlus} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Purchase menu</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
