import { useSyncExternalStore, type CSSProperties } from "react";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { HudFrame } from "../elements/plate";
import { uiFrameImageSet } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { RandomDie, ResetAllHold, type LayoutEditor } from "./layout-editor";

/** A change of the score, signed: "+36", "−12". */
export const signed = (change: number) => `${change > 0 ? "+" : "−"}${formatInteger(Math.abs(change))}`;

/** Use's pill: the book's Save pill, the frame's copies (`save-pill`, `ui-art.ts`). */
const SAVE_PILL = { "--save-pill": uiFrameImageSet("save-pill") } as CSSProperties;
/**
 * Use pressed in: the layout shown is the village's (the pill sunk by its lip, its gold darkened; off, not faded). The pill shows the
 * press: the state layer's selected tint (`aria-pressed`, a lighter box over the whole target) is cleared.
 */
const USE_PRESSED = { ...SAVE_PILL, transform: "translateY(2px)", filter: "brightness(0.7) saturate(0.8)", opacity: 1, backgroundImage: "none" } as CSSProperties;

/**
 * The bar's place: over the points and the panel (what hangs from it, the die's "Still building…", shows over them), the HUD's inset
 * off the screen's top and sides (`HUD_INSET_BOX`'s classes, written out: an import of `hud-inset` here would split it from the
 * home's chunk into one of its own, in the first load).
 */
const EDIT_BAR_BOX = "pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-(--hud-inset-top) pr-(--hud-inset-right) pl-(--hud-inset-left)";

/** From this width (`--breakpoint-tablet`) the bar is the side menu's header (`docked`), the inventory under it (the owner's asks). */
export const DOCK_QUERY = "(min-width: 40rem)";
/**
 * The docked side menu's width: the HUD drawers' (`hud-drawer.tsx`, 28 rem) where the screen has room, half of it on a tablet, never
 * under 22 rem, so the bar fits on one row ("Edit" alone under `desktop`) and the village keeps room beside it (a style: the budget).
 */
export const DOCK_WIDTH = "min(28rem, max(22rem, 50vw))";
/** The docked bar's height, the inventory's top under it (the drawers' band: 44 px and its padding). */
export const DOCK_BAR_HEIGHT = "4rem";
const DOCK_BOX: CSSProperties = { width: DOCK_WIDTH, height: DOCK_BAR_HEIGHT };
const dockList = () => (typeof matchMedia === "function" ? matchMedia(DOCK_QUERY) : null);
const onDockChange = (on: () => void) => {
  const list = dockList();
  list?.addEventListener("change", on);
  return () => list?.removeEventListener("change", on);
};
/**
 * The screen is `desktop`'s or wider: the bar docked in the side menu's head. Its own hook (`lib/side-panel`'s would add a chunk to the
 * stage's static imports, which the home's first load lists).
 */
export const useDocked = () => useSyncExternalStore(onDockChange, () => dockList()?.matches ?? false, () => false);
/** The HUD drawers' close and Back (`hud-drawer.tsx`'s `CONTROL`). */
const CONTROL = "state-layer grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none";

/** Use (#804's Make active) as the bar shows it: the layout edited is the village's (Use pressed in, off), or can be used, asked first (the stage). */
export interface EditBarUse {
  active: boolean;
  disabled: boolean;
  busy: boolean;
  onUse: () => void;
}

/** The HUD's raised disc under a 44 px round button (`layout-editor.tsx`'s `HUD_DISC`). */
const HUD_DISC = "hud-disc bg-transparent";

/**
 * Edit mode's bar over the scene (EDIT-VILLAGE, after the Paved UX Book's "Edit my village", 2026-11-05): one band in the HUD's frame
 * (its grey rim, HUD-RIM-GREY, in place of the book's blue), the HUD's inset off the screen's top and sides, a phone's width. In it:
 * Back, the HUD drawers' (the owner's ask: the Missions' and the profile's, in place of the book's gold disc; out of edit mode, asking
 * first with changes: it is the way to drop a draft), "Edit" (at every phone's width: the owner's ask), the die (#803), Erase held (#756's Reset all, the eraser), Save on a disc (the floppy disk) and Use on the
 * book's gold pill: the layout edited made the village attackers face (#804), asked first; on the village's own, pressed in and off
 * (the carousel says "Active"), off until the layouts are served, never hidden, so the buttons keep their places (the owner's asks of
 * 2026-11-05, the layouts themselves being the panel's). The points left
 * the bar for the top left (`EditPoints`), the slots used for the inventory's title (`EditPanel`). From `tablet` (`docked`; the owner's
 * asks: from `desktop`, then from `tablet` too) the bar is the side menu's header at the screen's top right, as the HUD drawers' (the
 * Missions', the profile's, the League's): their band (the card's charcoal, its hairline under it), "Edit village" on the left in their
 * title's display font ("Edit" under `desktop`, the menu narrower), their red close at the end in Back's place. The book's phone draws its round buttons at about 25 px: at the 44 px touch floor a phone has room for the rest only.
 * One size at every width (the stylesheet's budget). Its parts are the stage's chunk (FIRST-LOAD).
 */
export function EditBar({ editor, holdMs, save, use, docked = false }: { editor: LayoutEditor; holdMs?: number; save: { onSave: () => void; disabled: boolean; busy: boolean }; use?: EditBarUse; docked?: boolean }) {
  return (
    <div data-bubble-avoid data-edit-bar={docked ? "docked" : "float"} className={docked ? "absolute top-0 right-0 z-10" : EDIT_BAR_BOX} style={docked ? DOCK_BOX : undefined}>
      <header
        className={cn(
          "pointer-events-auto relative isolate flex items-center",
          docked ? "drawer-band size-full gap-1 border-l border-input px-2" : "h-14 w-full gap-1 px-0.5",
        )}
      >
        {docked ? (
          // The drawers' side panel's title: the display font, on the left.
          <h2 className="min-w-0 flex-1 truncate pl-2 font-display text-2xl leading-tight tracking-wide text-outline">
            Edit{" "}<span className="hidden desktop:inline">village</span>
          </h2>
        ) : (
          <>
            <HudFrame px={14} />
            {/* Back as the HUD's drawers' (the Missions', the profile's: the owner's ask of 2026-11-05), the title about 12 px after its glyph, at every phone's width (the owner's ask: room down to 320 px). */}
            <button type="button" onClick={editor.back} aria-label="Leave edit mode" className={CONTROL}>
              <Icon name="chevron-left" className="drawer-icon" />
            </button>
            <h2 className="-ml-2 mr-auto font-display text-lg whitespace-nowrap text-outline">Edit</h2>
          </>
        )}
        <span className={cn("ml-auto flex shrink-0 items-center", docked ? "gap-1" : "gap-0.5")}>
          <RandomDie editor={editor} look="hud" />
          <ResetAllHold editor={editor} holdMs={holdMs} look="hud" />
          {/* Save on the HUD's disc: the floppy disk, painted as the die (the owner's ask of 2026-11-05, Use taking the gold pill). */}
          <Button variant="secondary" size="icon" aria-label="Save" title="Save" onClick={save.onSave} disabled={save.disabled} loading={save.busy} className={cn("size-11 rounded-full", HUD_DISC)}>
            <UiIcon name="save" size="sm" className="drawer-icon" px={24} />
          </Button>
          {/*
            Use on the book's gold pill (its painted face, rim and lip, `save-pill`, `gold-pill` in theme.css), 36 px tall in its 44 px
            target, the word white and heavy, outlined as the book's; on the village's own layout pressed in and off. Always there, so
            the bar's buttons keep their places from one layout to the next (the owner's ask of 2026-11-05): off until the layouts are
            served (#804; loading, or no signer).
          */}
          <Button
            variant="ghost"
            aria-pressed={use?.active ?? false}
            title={use?.active ? "In use: the village attackers face" : undefined}
            onClick={use?.onUse}
            disabled={!use || use.active || use.disabled}
            loading={use?.busy}
            className="gold-pill h-11 rounded-lg px-4 text-lg font-black"
            style={use?.active ? USE_PRESSED : SAVE_PILL}
          >
            Use
          </Button>
        </span>
        {/* The drawers' side panel's close, at the band's end (the owner's ask of 2026-11-05). */}
        {docked && (
          <button type="button" onClick={editor.back} aria-label="Leave edit mode" className={CONTROL}>
            <UiIcon name="close" px={36} className="drawer-icon size-9" />
          </button>
        )}
      </header>
    </div>
  );
}

/** The slots used of the level's, the slabs before them: at the inventory's title's end. */
export function SlotsUsed({ editor, className }: { editor: LayoutEditor; className?: string }) {
  return (
    <span role="img" aria-label={`${editor.used} of ${editor.slots} slots used`} className={cn("flex shrink-0 items-center gap-1", className)}>
      <UiIcon name="deck" size="sm" className="drawer-icon" px={24} />
      <span aria-hidden className={cn("numeric text-base font-bold whitespace-nowrap text-outline", editor.over && "text-warning")}>
        {editor.used}/{editor.slots}
      </span>
    </span>
  );
}
