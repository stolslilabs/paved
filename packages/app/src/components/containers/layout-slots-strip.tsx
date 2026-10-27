import { useMemo, useState } from "react";
import type { BoardTile } from "@paved/chain";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Cobbles } from "../elements/cobbles";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Icon } from "../ui/icon";
import type { LayoutEditor } from "./layout-editor";
import { sameLayout } from "./layout-rules";

// The saved layouts' strip (#804, as Clash of Clans' layouts): three slots above the inventory in the editor's panel (open
// point 3), each with a small plan of its layout, its score, and "Active" on the one that is the village. A slot is picked,
// then acted on: Load (its layout into the draft, asking first when the draft holds changes kept nowhere), Save here (the
// draft into another slot, the village unchanged: a backup, a project, the die's village, #803), Make active (asked first:
// attackers face it) and, on a locked slot, Buy with Cobbles (asked first). The editor's Save stays the active slot's.

/** One slot as the strip shows it. */
export interface LayoutSlot {
  /** Its index, 0 to 2 (shown as slot 1 to 3). */
  slot: number;
  /** The player's: the free slot, or one bought. */
  open: boolean;
  /** Its price in Cobbles (0 for the free one). */
  price: number;
  /** Its layout, the starter included; null: empty (or locked). */
  tiles: readonly BoardTile[] | null;
  score: number;
  /** Its layout passes the rules against the stock and the slots (open point 4: else it needs editing first). */
  fits: boolean;
}

/** A slot write on its way. */
export interface LayoutSlotBusy {
  kind: "save-to" | "activate" | "buy";
  slot: number;
}

/** A question the strip asks before it acts. */
export type LayoutSlotAsk = "load" | "activate" | "buy";

export interface LayoutSlotsProps {
  /** The active slot: its layout is the village. */
  active: number;
  slots: readonly LayoutSlot[];
  /** The player's Cobbles, when read: a slot they cannot pay for says so. */
  cobbles?: number | null;
  busy?: LayoutSlotBusy | null;
  /** The last slot write refused, in words. */
  error?: string | null;
  errorDetail?: ErrorDetail;
  onSaveTo?: (slot: number, tiles: readonly BoardTile[]) => void;
  onActivate?: (slot: number) => void;
  /** Buy `slot` at the price shown. */
  onBuy?: (slot: number, price: number) => void;
  onDismissError?: () => void;
  /** Where the stories start: the slot picked (the active one when unset) and a question open on it. */
  initialSelected?: number;
  initialAsk?: LayoutSlotAsk | null;
}

const slotName = (slot: number) => `Slot ${slot + 1}`;

/** The three slots of the editor's panel and the actions of the one picked. */
export function LayoutSlotsStrip({ editor, className, ...props }: LayoutSlotsProps & { editor: LayoutEditor; className?: string }) {
  const { active, slots, busy, cobbles } = props;
  const [picked, setPicked] = useState(props.initialSelected ?? active);
  const [ask, setAsk] = useState<LayoutSlotAsk | null>(props.initialAsk ?? null);
  const slot = slots.find((s) => s.slot === picked) ?? slots[active]!;
  const working = !!busy || editor.saving;
  const draftHere = !!slot.tiles && sameLayout(editor.draft, slot.tiles);
  const short = cobbles != null && cobbles < slot.price;

  const load = () => {
    if (!slot.tiles) return;
    if (editor.unkept) return setAsk("load");
    editor.load(slot.tiles);
  };
  const saveHere = () => {
    editor.cancelRoll();
    props.onSaveTo?.(slot.slot, editor.draft);
  };
  const confirm = () => {
    setAsk(null);
    if (ask === "load" && slot.tiles) editor.load(slot.tiles);
    else if (ask === "activate") props.onActivate?.(slot.slot);
    else if (ask === "buy") props.onBuy?.(slot.slot, slot.price);
  };

  return (
    <section aria-label="Saved layouts" className={cn("flex flex-col gap-2", className)}>
      <InlineError
        title="Layouts"
        message={props.error ?? null}
        detail={props.errorDetail}
        action={
          props.onDismissError && (
            <Button size="sm" variant="ghost" onClick={props.onDismissError}>
              Dismiss
            </Button>
          )
        }
      />
      <div role="group" aria-label="Layout slots" className="grid grid-cols-3 gap-2">
        {slots.map((s) => (
          <SlotCard key={s.slot} slot={s} active={s.slot === active} picked={s.slot === slot.slot} onPick={() => setPicked(s.slot)} />
        ))}
      </div>
      <div className="flex gap-2">
        {!slot.open ? (
          <Button className="flex-1" onClick={() => setAsk("buy")} disabled={working || short} loading={busy?.kind === "buy" && busy.slot === slot.slot}>
            <Icon name="lock-open" size="sm" /> Buy {slotName(slot.slot).toLowerCase()} · <Cobbles value={slot.price} />
          </Button>
        ) : (
          <>
            {slot.tiles && (
              <Button variant="outline" className="flex-1 px-3" onClick={load} disabled={working || draftHere}>
                <Icon name="pen" size="sm" /> Load
              </Button>
            )}
            {slot.slot !== active && (
              <Button
                variant="outline"
                className="flex-1 px-3"
                onClick={saveHere}
                disabled={working || draftHere || editor.over || editor.rolling}
                loading={busy?.kind === "save-to" && busy.slot === slot.slot}
              >
                <Icon name="check-to-slot" size="sm" /> Save here
              </Button>
            )}
            {slot.tiles && slot.slot !== active && (
              <Button
                variant="secondary"
                className="flex-1 px-3"
                onClick={() => setAsk("activate")}
                disabled={working || !slot.fits}
                loading={busy?.kind === "activate" && busy.slot === slot.slot}
              >
                <Icon name="flag" size="sm" /> Make active
              </Button>
            )}
          </>
        )}
      </div>
      {slot.open && slot.tiles && !slot.fits && <p className="px-1 text-xs text-warning">Needs tiles you no longer hold: load it and edit it before it can be active.</p>}
      {!slot.open && short && <p className="px-1 text-xs text-muted-foreground">Not enough Cobbles yet.</p>}
      {slot.open && slot.slot === active && <p className="px-1 text-xs text-muted-foreground">The village attackers face. Save keeps your changes here.</p>}
      {slot.open && !slot.tiles && <p className="px-1 text-xs text-muted-foreground">Empty: save the draft here, the village stays as it is.</p>}
      <SlotDialog ask={ask} slot={slot} cobbles={cobbles} onCancel={() => setAsk(null)} onConfirm={confirm} />
    </section>
  );
}

/** A slot's card: its plan, its name and score (or empty, or locked with its price), "Active" on the village's. */
function SlotCard({ slot, active, picked, onPick }: { slot: LayoutSlot; active: boolean; picked: boolean; onPick: () => void }) {
  const name = slotName(slot.slot);
  const label = !slot.open
    ? `${name}, locked: ${formatInteger(slot.price)} Cobbles`
    : slot.tiles
      ? `${name}${active ? ", active" : ""}: score ${formatInteger(slot.score)}`
      : `${name}, empty`;
  return (
    <button
      type="button"
      aria-pressed={picked}
      aria-label={label}
      onClick={onPick}
      className={cn(
        "relative flex min-h-11 flex-col items-stretch gap-1 rounded-lg border bg-background/40 p-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        picked ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground",
      )}
    >
      <div className="flex h-10 items-center justify-center overflow-hidden rounded-md bg-board/60">
        {!slot.open ? (
          <Icon name="lock" size="sm" className="text-muted-foreground" />
        ) : slot.tiles ? (
          <SlotPlan tiles={slot.tiles} />
        ) : (
          <Icon name="plus" size="sm" className="text-muted-foreground" />
        )}
      </div>
      <div aria-hidden className="flex items-center justify-between gap-1 text-xs">
        <span className="font-semibold">{slot.slot + 1}</span>
        {!slot.open ? (
          <Cobbles value={slot.price} size="sm" tone="muted" />
        ) : slot.tiles ? (
          <span className={cn("numeric", !slot.fits && "text-warning")}>{formatInteger(slot.score)}</span>
        ) : (
          <span className="text-muted-foreground">Empty</span>
        )}
      </div>
      {active && (
        <Badge aria-hidden className="absolute -top-2 right-1 px-1.5 py-0 text-[0.75rem] leading-4">
          Active
        </Badge>
      )}
    </button>
  );
}

/** A layout's small plan: a square per tile, the starter lit, fitted to its box. */
function SlotPlan({ tiles }: { tiles: readonly BoardTile[] }) {
  const box = useMemo(() => {
    const xs = tiles.map((t) => t.x);
    const ys = tiles.map((t) => t.y);
    const minX = Math.min(...xs);
    const maxY = Math.max(...ys);
    return { minX, maxY, w: Math.max(...xs) - minX + 1, h: maxY - Math.min(...ys) + 1 };
  }, [tiles]);
  return (
    <svg aria-hidden viewBox={`-0.1 -0.1 ${box.w + 0.2} ${box.h + 0.2}`} className="h-full w-full p-1" preserveAspectRatio="xMidYMid meet">
      {tiles.map((t) => (
        <rect
          key={`${t.x},${t.y}`}
          x={t.x - box.minX + 0.08}
          y={box.maxY - t.y + 0.08}
          width={0.84}
          height={0.84}
          rx={0.12}
          className={t.x === 0 && t.y === 0 ? "fill-primary" : "fill-muted-foreground/70"}
        />
      ))}
    </svg>
  );
}

const ASKS: Record<LayoutSlotAsk, { title: (name: string) => string; action: string }> = {
  load: { title: (name) => `Load ${name.toLowerCase()}?`, action: "Load" },
  activate: { title: (name) => `Make ${name.toLowerCase()} active?`, action: "Make active" },
  buy: { title: (name) => `Buy ${name.toLowerCase()}?`, action: "Buy" },
};

/** The strip's questions: load over changes kept nowhere, make a slot active, buy a slot. */
function SlotDialog({ ask, slot, cobbles, onCancel, onConfirm }: { ask: LayoutSlotAsk | null; slot: LayoutSlot; cobbles?: number | null; onCancel: () => void; onConfirm: () => void }) {
  const name = slotName(slot.slot);
  const text = ASKS[ask ?? "load"];
  return (
    <Dialog open={ask !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title(name)}</DialogTitle>
          <DialogDescription>
            {ask === "load" && `Your changes are not saved in any slot: ${name.toLowerCase()}'s layout replaces them.`}
            {ask === "activate" && `Attackers will face this layout: it becomes your village. The other slots keep theirs.`}
            {ask === "buy" && `It opens empty, yours for good: save a layout into it to keep a backup or try another.`}
          </DialogDescription>
        </DialogHeader>
        {ask === "buy" && (
          <p className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            <span>Price</span>
            <Cobbles value={slot.price} />
            {cobbles != null && (
              <span className="text-xs text-muted-foreground">
                You hold <Cobbles value={cobbles} size="sm" tone="muted" />
              </span>
            )}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {ask === "load" ? "Keep editing" : "Cancel"}
          </Button>
          <Button onClick={onConfirm}>{text.action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
