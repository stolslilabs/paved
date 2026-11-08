import { useCallback, useEffect, useLayoutEffect, type RefObject } from "react";
import type { GameScene } from "@paved/renderer";
import { UiIcon } from "../elements/ui-icon";
import type { UiIconName } from "../elements/ui-art";
import { ACTION_PX, avoidOf, layoutTileActions, type ActionPlaces, type ActionSide, type BubbleAvoid, type Point } from "./tile-actions-layout";

/**
 * The parts the tile's actions (TILE-ACTIONS, `tile-bubble.tsx`) share with the long press's Edit village by a tile of the home village
 * (PRESS-BUILD, `press-bubble.tsx`): the painted round button and its placing round the tile. Each is its own chunk; this module is
 * what both take.
 */

/** A painted action: the book's round button, the whole 44 px target; hover and press are every button's white states (`state-layer`). */
export const PAINTED = "size-11 rounded-full p-0";

/** A painted button's art at the target's size. */
export function ActionArt({ art }: { art: UiIconName }) {
  return <UiIcon name={art} px={ACTION_PX} className="pointer-events-none size-11" />;
}

/** The tile as the actions stand round it: its outline on screen and the box they stand in, CSS px of that box. */
export interface ActionFrame {
  outline: readonly Point[];
  /** The box the room is measured in (the screen less its margins, the HUD, the hand panel and the side menu: `layoutTileActions`). */
  box: DOMRect;
  /**
   * Where the buttons' own box (the actions' element, which their transforms are taken from) starts in `box`: none when it is `box`
   * (the board's overlay), the pressed cell's corner on the plan view, whose element stands on the cell inside the scrolling plan.
   */
  origin?: Point;
}

/**
 * Where the buttons stand round the tile, clear of the parts marked `data-bubble-avoid`: the tile's four actions (`layoutTileActions`,
 * the default) or one alone (`layoutTileAction`, the long press's).
 */
export type ActionsLayout = (outline: readonly Point[], box: DOMRect, avoid: readonly BubbleAvoid[]) => Partial<ActionPlaces>;

/**
 * Writes each `[data-side]` button of `el` at its place round the tile (`layout`, clear of every `data-bubble-avoid`) and shows it: no
 * React render, so it runs on each camera notification.
 */
export function placeActions(el: HTMLElement, { outline, box, origin }: ActionFrame, layout: ActionsLayout = layoutTileActions): void {
  const at = layout(outline, box, Array.from(document.querySelectorAll("[data-bubble-avoid]"), avoidOf));
  const dx = (origin?.x ?? 0) + ACTION_PX / 2;
  const dy = (origin?.y ?? 0) + ACTION_PX / 2;
  for (const button of el.querySelectorAll<HTMLElement>("[data-side]")) {
    const p = at[button.dataset.side as ActionSide];
    if (!p) continue;
    button.style.transform = `translate(${Math.round(p.x - dx)}px, ${Math.round(p.y - dy)}px)`;
    button.style.visibility = "visible";
  }
}

/**
 * The actions of `ref`'s element (an overlay over the board, `absolute inset-0`) follow the tile at `cell` on `scene`: placed from the
 * tile's outline on screen (`projectCellOutline`, by `layout`) on each camera notification, again when `shown` changes (an action comes
 * or goes) and when a part they keep clear of resizes (the hand panel, the editor's panel or bar, the HUD). `layout` is a module's
 * constant: it is no dependency.
 */
export function useFollowTile(ref: RefObject<HTMLElement | null>, scene: GameScene | null | undefined, cell: { x: number; y: number } | undefined, shown = "", layout?: ActionsLayout): void {
  const place = useCallback(() => {
    const el = ref.current;
    if (!el || !scene || !cell) return;
    const outline = scene.projectCellOutline(cell.x, cell.y);
    if (!outline) return;
    placeActions(el, { outline, box: el.getBoundingClientRect() }, layout);
    // The cell by its coordinates: a new object for the same cell places nothing new.
  }, [ref, scene, cell?.x, cell?.y]);
  useLayoutEffect(() => {
    place();
    return scene?.onCameraChange(place);
  }, [place, scene, shown]);
  useEffect(() => {
    if (!scene || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(place);
    for (const e of document.querySelectorAll("[data-bubble-avoid]")) observer.observe(e);
    return () => observer.disconnect();
  }, [scene, place]);
}
