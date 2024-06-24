import { useDojo } from "../../dojo/useDojo";
import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { useActions } from "@/hooks/useActions";
import icon from "/assets/icons/CONFIRM.svg";

export const Confirm = () => {
  const {
    account: { account },
  } = useDojo();

  const { handleConfirm, disabled, builder } = useActions();

  if (!account || !builder) return <></>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={disabled}
            variant={"command"}
            size={"command"}
            onClick={handleConfirm}
          >
            <img src={icon} className="h-4 lg:h-8 fill-current" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Confirm selection</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
