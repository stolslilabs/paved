import { useDojo } from "../../dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { useActions } from "@/hooks/useActions";
import { useGame } from "@/hooks/useGame";
import icon from "/assets/icons/BURN.svg";

export const Discard = () => {
  const { gameId } = useQueryParams();
  const { enabled } = useActions();
  const {
    account: { account },
  } = useDojo();

  const { game } = useGame({ gameId });

  const { handleDiscard, builder } = useActions();

  if (!account || !game || !builder) return <></>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={!enabled}
            variant={"command"}
            size={"command"}
            onClick={handleDiscard}
          >
            <img src={icon} className="h-4 lg:h-8 fill-current" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Discard tile</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
