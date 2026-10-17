import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { formatPoints } from "../elements/score";

export interface SurrenderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The 24 hours are over: the dialog says why it opened by itself. */
  expired?: boolean;
  score: number;
  onSurrender: () => void;
}

/**
 * The Surrender confirmation. Its own module so that the board's route chunk does not carry the dialog and Radix under it
 * (BOARD-CHUNK): `BoardScene` loads it at the first Surrender, and in the browser's idle time before.
 */
export function SurrenderDialog({ open, onOpenChange, expired, score, onSurrender }: SurrenderDialogProps) {
  return (
    // Radix closes it on Esc and on a click outside (P3); the game goes on.
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false}>
        <DialogHeader>
          <DialogTitle>Surrender this game?</DialogTitle>
          <DialogDescription>
            {expired && "Its 24 hours are over: it takes no more moves, and only a surrender closes it. "}
            It ends now with your score of <span className="numeric">{formatPoints(score)}</span>. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Keep playing</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onSurrender();
            }}
          >
            Surrender
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
