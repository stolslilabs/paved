import { useDojo } from "../../dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { Button } from "@/ui/elements/button";
import { useActions } from "@/hooks/useActions";
import { useGame } from "@/hooks/useGame";
import icon from "/assets/icons/burn.svg";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../elements/dialog";

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
    <Dialog>
      <DialogTrigger asChild>
        <Button
          disabled={!enabled}
          className="px-2 w-10 py-5 border-none bg-[#D2E2F1] bg-opacity-80 rounded-md"
        >
          <img src={icon} className="w-6" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you absolutely sure?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. Discarding your tile will deduct 50
            points and forfeit a move.
            <br />
            <br />
            Are you sure?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-1">
          <DialogClose asChild>
            <Button onClick={handleDiscard} type="button" variant="destructive">
              Discard
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
