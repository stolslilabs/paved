import type { CSSProperties, ReactNode } from "react";
import type { UiIconName } from "../elements/ui-art";
import { formatCobbles } from "../elements/cobbles";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";

/**
 * The answer's button: the Shop's price button (SHOP-PAGE, `shop-card.tsx`'s `PRICE` on main), the HUD's raised grey with its lip,
 * the state layer's tint over it; in the destructive red where the answer drops something.
 */
const RAISED: CSSProperties = {
  backgroundImage: "linear-gradient(var(--layer, transparent), var(--layer, transparent)), linear-gradient(var(--drawer-raised), var(--secondary))",
  boxShadow: "inset 0 1px 0 var(--drawer-bevel), 0 0 0 1px var(--hud-outline), 0 2px 0 1px var(--hud-outline)",
};
const DESTRUCTIVE: CSSProperties = { ...RAISED, backgroundImage: "linear-gradient(var(--layer, transparent), var(--layer, transparent))", backgroundColor: "var(--destructive)" };
/** The HUD drawers' close (`hud-drawer.tsx`'s `CONTROL`). */
const CLOSE = "state-layer grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none";

export interface HudDialogAction {
  /** The button's whole name ("Load", "Unlock layout 2 for 100 Cobbles"); its word where it shows one. */
  label: string;
  /** Its icon, before the word. */
  art?: UiIconName;
  /** A price in Cobbles: the button shows it as the book's Shop writes it (the Cobble and the figure), not the word. */
  price?: number;
  onClick: () => void;
  disabled?: boolean;
  /** `destructive`: in red (what it drops is lost). */
  tone?: "raised" | "destructive";
}

export interface HudDialogProps {
  open: boolean;
  /** The close, Escape or a tap outside. */
  onCancel: () => void;
  /** The close's name: what not answering does ("Cancel", "Keep editing"). */
  cancel: string;
  title: string;
  description: ReactNode;
  action: HudDialogAction;
  /** Under the answer (the Cobbles held, say). */
  note?: ReactNode;
}

/**
 * Edit mode's questions in the HUD drawers' look (EDIT-VILLAGE, the owner's asks of 2026-11-05: the old card did not match the new
 * style; the Paved UX Book draws no such popup): their band with the question in their title's display font and their red close
 * (the way not to answer: no Cancel beside it, the owner's ask), their lighter body, then one answer the body's width, the Shop's
 * raised button with its icon and its word, or its price as the Shop writes it, in red where it drops something. The layouts'
 * questions (`SlotDialog`) and Leave (`LeaveEditDialog`, the home's).
 */
export function HudDialog({ open, onCancel, cancel, title, description, action, note }: HudDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent showClose={false} className="grid-cols-1 gap-0 overflow-hidden rounded-2xl border-input bg-secondary p-0 sm:max-w-sm">
        <header className="drawer-band flex items-center gap-1 py-1.5 pr-2 pl-4">
          {/* The question wraps on the narrowest phones rather than lose its end. */}
          <DialogTitle className="min-w-0 flex-1 font-display text-2xl leading-tight font-normal tracking-wide text-balance text-outline">{title}</DialogTitle>
          <DialogClose aria-label={cancel} title={cancel} className={CLOSE}>
            <UiIcon name="close" px={36} className="drawer-icon size-9" />
          </DialogClose>
        </header>
        <div className="flex flex-col gap-4 px-3 py-4 mobile:px-4">
          <DialogDescription>{description}</DialogDescription>
          <Button
            variant="ghost"
            aria-label={action.label}
            onClick={action.onClick}
            disabled={action.disabled}
            className="h-11 w-full gap-1.5 rounded-xl px-3 text-lg font-bold text-outline"
            style={action.tone === "destructive" ? DESTRUCTIVE : RAISED}
          >
            {action.art && <UiIcon name={action.art} size="sm" px={24} className="drawer-icon" />}
            {action.price != null ? (
              <>
                <TokenIcon kind="cobbles" size="em" />
                <span className="numeric">{formatCobbles(action.price)}</span>
              </>
            ) : (
              action.label
            )}
          </Button>
          {note}
        </div>
      </DialogContent>
    </Dialog>
  );
}
