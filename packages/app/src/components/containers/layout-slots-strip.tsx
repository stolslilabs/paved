import { useEffect, useRef, useState } from "react";
import * as m from "motion/react-m";
import { useReducedMotionConfig } from "motion/react";
import type { BoardTile } from "@paved/chain";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Cobbles } from "../elements/cobbles";
import { TokenIcon } from "../elements/token-icon";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { HudDialog } from "./hud-dialog";
import type { LayoutEditor } from "./layout-editor";
import { sameLayout } from "./layout-rules";

// The saved layouts (#804, as Clash of Clans' layouts) as a carousel of one (EDIT-VILLAGE, the owner's ask of 2026-11-05), above the
// inventory at every width: the layout edited, "Layout 1" to "Layout 3", between two arrows. An arrow moves to the next layout and
// loads it into the editor (#804's Load, asked first over changes kept nowhere; an empty one keeps the draft, Save keeps it there,
// #804's Save here); the scene slides the same way (the stage). A locked layout is a step of its own (#1033: the slots are bought in
// any order, `rules/layout-slots.ts`): shown, its word is its Purchase (#804's Buy with Cobbles, asked first), the draft and Save's
// layout unchanged, and the arrows go on past it; bought, the carousel moves on to it. Using a layout (#804's Make active) is the
// editor's bar's.

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

export const slotName = (slot: number) => `Layout ${slot + 1}`;

/** The layout edited, as the stage holds it. */
export interface LayoutPickerProps {
  /** The layout edited: the one the draft came from or goes to, Save's target. */
  picked: number;
  /** Another layout edited (an arrow, a swipe, a purchase landed). */
  onPick: (slot: number) => void;
}

/** A word beside the layout's name, as the Tiles page's skins' (COLLECTION-PAGE): carved, it informs; raised, it presses. */
const PILL = "flex h-6 items-center rounded-full px-2.5 text-xs leading-none font-bold";
/** The arrows: the HUD drawers' 44 px controls. */
const ARROW = "state-layer grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none disabled:cursor-default disabled:opacity-40";
/** A swipe's least travel, CSS px; the page still scrolls up and down over it (a style: the stylesheet's budget). */
const SWIPE_PX = 40;
const SWIPE_AREA = { touchAction: "pan-y" } as const;

/**
 * The layouts' carousel (EDIT-VILLAGE): ‹ Layout N and its word (Active on the village's, Empty) › (its score is the top left's, the
 * layout loaded); a locked layout's word a raised Purchase (the padlock, the Cobbles' stone and the price), the arrows going on past it
 * (#1033). Swiped left or right too. Under it, what to know about the layout shown.
 */
export function LayoutSlotsStrip({ editor, picked, onPick, className, ...props }: LayoutSlotsProps & LayoutPickerProps & { editor: LayoutEditor; className?: string }) {
  const { active, slots, busy, cobbles } = props;
  const still = useReducedMotionConfig() ?? false;
  const [ask, setAsk] = useState<LayoutSlotAsk | null>(props.initialAsk === "activate" ? null : (props.initialAsk ?? null));
  const [asked, setAsked] = useState(props.initialSelected ?? picked);
  // The layout shown: the one edited, or a locked one stepped onto (a story's locked slot picked first, `initialSelected`). Another
  // layout edited (a load, a purchase landed) is shown at once.
  const [view, setView] = useState(props.initialSelected ?? picked);
  const [seen, setSeen] = useState(picked);
  if (seen !== picked) {
    setSeen(picked);
    setView(picked);
  }
  const edited = slots.find((s) => s.slot === picked) ?? slots[active]!;
  const shown = slots.find((s) => s.slot === view && !s.open) ?? edited;
  const at = Math.max(0, slots.indexOf(shown));
  const before = slots[at - 1];
  const after = slots[at + 1];
  const target = slots.find((s) => s.slot === asked) ?? shown;
  const working = !!busy || editor.saving;
  const short = cobbles != null && cobbles < target.price;
  // The way the layout shown came: its name slides in from that side.
  const [came, setCame] = useState({ slot: shown.slot, way: 0 });
  if (came.slot !== shown.slot) setCame({ slot: shown.slot, way: shown.slot > came.slot ? 1 : -1 });

  const go = (slot: LayoutSlot) => {
    if (working) return;
    // A locked layout, or back to the one edited: shown, nothing loaded.
    if (!slot.open || slot.slot === picked) return setView(slot.slot);
    if (slot.tiles && !sameLayout(editor.draft, slot.tiles)) {
      if (editor.unkept) {
        setAsked(slot.slot);
        return setAsk("load");
      }
      editor.load(slot.tiles);
    }
    setView(slot.slot);
    onPick(slot.slot);
  };
  const purchase = () => {
    if (working) return;
    setAsked(shown.slot);
    setAsk("buy");
  };
  // A layout bought: the carousel moves on to it once it is open, the draft kept.
  const [bought, setBought] = useState<number | null>(null);
  useEffect(() => {
    if (bought === null || !slots.some((s) => s.slot === bought && s.open)) return;
    setBought(null);
    onPick(bought);
  }, [bought, slots, onPick]);
  const confirm = () => {
    setAsk(null);
    if (ask === "load" && target.tiles) {
      editor.load(target.tiles);
      setView(target.slot);
      onPick(target.slot);
    } else if (ask === "buy") {
      setBought(target.slot);
      props.onBuy?.(target.slot, target.price);
    }
  };
  const from = useRef<number | null>(null);

  const name = slotName(shown.slot);
  const locked = !shown.open;
  const hint = locked
    ? cobbles != null && cobbles < shown.price
      ? `Not enough Cobbles yet. Save keeps your changes in ${slotName(edited.slot).toLowerCase()}.`
      : `Locked: unlock it to keep another layout. Save keeps your changes in ${slotName(edited.slot).toLowerCase()}.`
    : edited.tiles && !edited.fits
      ? null
      : edited.slot === active
        ? "The village attackers face. Save keeps your changes here."
        : !edited.tiles
          ? "Empty: Save keeps your village here."
          : sameLayout(editor.draft, edited.tiles)
            ? "Use makes it the village attackers face."
            : "Save first: Use takes the saved layout.";
  return (
    <section aria-label="Saved layouts" className={cn("flex w-full flex-col gap-1", className)}>
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
      <div role="group" aria-label="Layouts" className="flex items-center gap-1">
        <button type="button" aria-label="Previous layout" disabled={!before || working} onClick={() => before && go(before)} className={ARROW}>
          <Icon name="chevron-left" className="drawer-icon" />
        </button>
        <div
          className="flex min-h-11 min-w-0 flex-1 items-center justify-center overflow-hidden"
          style={SWIPE_AREA}
          onPointerDown={(e) => {
            from.current = e.clientX;
          }}
          onPointerUp={(e) => {
            const start = from.current;
            from.current = null;
            if (start === null) return;
            const travel = e.clientX - start;
            if (travel <= -SWIPE_PX && after) go(after);
            else if (travel >= SWIPE_PX && before) go(before);
          }}
        >
          <m.div
            key={shown.slot}
            aria-live="polite"
            initial={still || came.way === 0 ? false : { x: came.way * 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="flex min-w-0 items-center gap-2 whitespace-nowrap"
          >
            <span className="text-base font-black text-outline">{name}</span>
            {locked ? (
              <button
                type="button"
                aria-label={`Purchase ${name.toLowerCase()} for ${formatInteger(shown.price)} Cobbles`}
                disabled={working}
                onClick={purchase}
                className="grid h-11 shrink-0 cursor-pointer place-items-center outline-none disabled:cursor-default disabled:opacity-50"
              >
                <span className={cn(PILL, "drawer-raised gap-1 text-outline", busy?.kind === "buy" && busy.slot === shown.slot && "pending-pulse")}>
                  <UiIcon name="padlock" size="xs" px={20} className="size-4" />
                  <TokenIcon kind="cobbles" size="em" />
                  <span className="numeric">{formatInteger(shown.price)}</span>
                </span>
              </button>
            ) : edited.slot === active ? (
              <span className={cn(PILL, "drawer-carved text-medal-1")}>Active</span>
            ) : (
              !edited.tiles && <span className={cn(PILL, "drawer-carved text-muted-foreground")}>Empty</span>
            )}
          </m.div>
        </div>
        <button type="button" aria-label="Next layout" disabled={!after || working} onClick={() => after && go(after)} className={ARROW}>
          <Icon name="chevron-right" className="drawer-icon" />
        </button>
      </div>
      {hint ? (
        <p className={cn("px-1 text-center text-xs", locked && cobbles != null && cobbles < shown.price ? "text-warning" : "text-muted-foreground")}>{hint}</p>
      ) : (
        <p className="px-1 text-center text-xs text-warning">Needs tiles you no longer hold: edit it before it can be used.</p>
      )}
      <SlotDialog ask={ask} slot={target} cobbles={cobbles} short={short} onCancel={() => setAsk(null)} onConfirm={confirm} />
    </section>
  );
}

const ASKS: Record<LayoutSlotAsk, { title: (name: string) => string; action: string; art?: UiIconName; cancel: string }> = {
  load: { title: (name) => `Load ${name.toLowerCase()}?`, action: "Load", art: "build", cancel: "Keep editing" },
  activate: { title: (name) => `Use ${name.toLowerCase()}?`, action: "Use", art: "village", cancel: "Cancel" },
  buy: { title: (name) => `Unlock ${name.toLowerCase()}?`, action: "Unlock", cancel: "Cancel" },
};

/**
 * The layouts' questions: load over changes kept nowhere, use a layout (the editor's bar asks it), buy one; in the HUD drawers' look
 * (`HudDialog`): Load with the plan, Use with the village; Unlock as the Shop's price (the Cobble and the figure), the Cobbles held
 * under it, the icon and the figure on one line.
 */
export function SlotDialog({ ask, slot, cobbles, short, onCancel, onConfirm }: { ask: LayoutSlotAsk | null; slot: LayoutSlot; cobbles?: number | null; short?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const name = slotName(slot.slot);
  const text = ASKS[ask ?? "load"];
  const buy = ask === "buy";
  return (
    <HudDialog
      open={ask !== null}
      onCancel={onCancel}
      cancel={text.cancel}
      title={text.title(name)}
      description={
        <>
          {ask === "load" && `Your changes are not saved in any slot: ${name.toLowerCase()}'s layout replaces them.`}
          {ask === "activate" && `Attackers will face this layout: it becomes your village. The other slots keep theirs.`}
          {buy && (short ? "Not enough Cobbles yet." : `Yours for good. It opens on your village as it is: change it, and Save keeps it there.`)}
        </>
      }
      action={
        buy
          ? { label: `Unlock ${name.toLowerCase()} for ${formatInteger(slot.price)} ${slot.price === 1 ? "Cobble" : "Cobbles"}`, price: slot.price, onClick: onConfirm, disabled: short }
          : { label: text.action, art: text.art, onClick: onConfirm }
      }
      note={
        buy &&
        cobbles != null && (
          <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            You hold <Cobbles value={cobbles} tone="muted" />
          </p>
        )
      }
    />
  );
}
