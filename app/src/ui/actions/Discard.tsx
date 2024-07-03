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
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../elements/dialog";
import { isMobile } from "react-device-detect";
import { ReactNode } from "react";

export const Discard = () => {
  const { gameId } = useQueryParams();
  const { enabled } = useActions();
  const {
    account: { account },
  } = useDojo();

  const { game } = useGame({ gameId });

  const { handleDiscard, builder } = useActions();

  if (!account || !game || !builder) return <></>;

  const DiscardButton = isMobile ? DialogButton : TooltipButton;

  return (
    <DiscardButton>
      <Button
        disabled={!enabled}
        variant={"command"}
        size={"command"}
        onClick={!isMobile ? handleDiscard : undefined}
        className="w-full"
      >
        <img src={icon} className="h-4 lg:h-8 fill-current" />
      </Button>
    </DiscardButton >
  )
};


const DialogButton = ({ children }: { children: ReactNode }) => {
  const { handleDiscard } = useActions();

  return (
    <Dialog>
      <DialogTrigger className="flex">
        {children}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you absolutely sure?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. Discarding your tile will deduct 50 points and forfeit a move.
            <br />
            <br />
            Are you sure?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-1">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button onClick={handleDiscard} type="button" variant="default">
              Discard
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const TooltipButton = ({ children }: { children: ReactNode }) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent>
          <p className="select-none">Discard tile</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}