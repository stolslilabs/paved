import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/ui/elements/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { Button } from "@/ui/elements/button";
import { useMemo } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useGame } from "@/hooks/useGame";
import icon from "/assets/icons/SURRENDER.svg";
import { useActions } from "@/hooks/useActions";

interface TProps { }

export const Surrender = (props: TProps) => {
  const { gameId } = useQueryParams();
  // const { account } = useAccount();
  const {
    account: { account },
    setup: {
      systemCalls: { surrender },
    },
  } = useDojo();

  const { game } = useGame({ gameId });
  const { handleSurrender, builder } = useActions();

  const disabled = useMemo(() => {
    return !!game?.over;
  }, [game]);

  if (!account || !game || !builder) return <></>;

  return (
    <AlertDialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <AlertDialogTrigger asChild>
              <Button disabled={disabled} variant={"command"} size={"command"}>
                <img src={icon} className="h-8 sm:h-4 md:h-8 fill-current" />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p className="select-none">Surrender</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Surrender?</AlertDialogTitle>
          <AlertDialogDescription>
            <div className="flex flex-col gap-4">
              <p>You are about to surrender, this action cannot be undone.</p>
              <p>Your score will be submitted and the game will be over.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSurrender}>
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
