import { formatPoints } from "../elements/score";
import { HudDialog } from "./hud-dialog";

export interface SurrenderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The 24 hours are over: the dialog says why it opened by itself. */
  expired?: boolean;
  score: number;
  onSurrender: () => void;
}

/**
 * The Surrender confirmation (from the in-game settings since #606, or by itself when a Challenge game expired), in the HUD's look
 * (GAME-OVERLAY: `HudDialog`, the band, the red close keeps playing, one answer in red with the painted white flag). Its own module so
 * that the board's route chunk does not carry the dialog and Radix under it (BOARD-CHUNK): `BoardScene` loads it at the first
 * Surrender, and in the browser's idle time before.
 */
export function SurrenderDialog({ open, onOpenChange, expired, score, onSurrender }: SurrenderDialogProps) {
  return (
    // Radix closes it on Esc and on a click outside (P3); the game goes on.
    <HudDialog
      open={open}
      onCancel={() => onOpenChange(false)}
      cancel="Keep playing"
      title="Surrender this game?"
      description={
        <>
          {expired && "Its 24 hours are over: it takes no more moves, and only a surrender closes it. "}
          It ends now with your score of <span className="numeric">{formatPoints(score)}</span>. This cannot be undone.
        </>
      }
      action={{
        label: "Surrender",
        art: "surrender",
        tone: "destructive",
        onClick: () => {
          onOpenChange(false);
          onSurrender();
        },
      }}
    />
  );
}

export interface RestartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestart: () => void;
}

/**
 * Training's Restart confirmation, from its in-game settings (#606; Story's Restart is held on the board, GAME-OVERLAY), in the
 * Surrender dialog's module and look: the same chunk, loaded the same way; the answer raised grey with the painted red arrow.
 */
export function RestartDialog({ open, onOpenChange, onRestart }: RestartDialogProps) {
  return (
    <HudDialog
      open={open}
      onCancel={() => onOpenChange(false)}
      cancel="Keep playing"
      title="Restart this game?"
      description="The same game starts again from its first tile, with the same deck. This game's moves and points are lost."
      action={{
        label: "Restart",
        art: "restart",
        onClick: () => {
          onOpenChange(false);
          onRestart();
        },
      }}
    />
  );
}
