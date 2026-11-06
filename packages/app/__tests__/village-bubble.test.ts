/**
 * The home editor's tile actions (EDIT-VILLAGE, #1033): the side menu from `tablet` is told by its marks (`data-edit-panel="side"`, its
 * bar `data-edit-bar="docked"`), never by its place, so the toolbar keeps left of it whether the menu is exactly half the screen (a
 * 768 px tablet) or its 22 rem minimum, past the half of a narrow one (640 px); the floating bar and a phone's sheet keep it from the
 * top and the foot.
 */
import { afterEach, describe, expect, it } from "vitest";
import { avoidOf, villageBubbleRoom, type BubbleAvoid } from "../src/components/containers/village-bubble";
import { MARGIN_PX } from "../src/components/containers/tile-bubble";

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/** The toolbar's size as the review measured it (Rotate, Back to the inventory, Cancel). */
const TOOLBAR = { width: 152, height: 48 };
const GAP_PX = 6;

/** Where the toolbar lands for a tile corner at `corner`, as `VillageBubble`'s `place` puts it. */
function placed(box: DOMRect, avoid: readonly BubbleAvoid[], corner: { x: number; y: number }) {
  const want = { x: corner.x - TOOLBAR.width / 2, y: corner.y - TOOLBAR.height - GAP_PX };
  const clamp = (x: number, y: number, l: { left: number; right: number; top: number; bottom: number }) => ({
    x: Math.min(Math.max(x, l.left), Math.max(l.left, l.right - TOOLBAR.width)),
    y: Math.min(Math.max(y, l.top), Math.max(l.top, l.bottom - TOOLBAR.height)),
  });
  const rough = clamp(want.x, want.y, { left: MARGIN_PX, right: box.width - MARGIN_PX, top: MARGIN_PX, bottom: box.height - MARGIN_PX });
  return clamp(want.x, want.y, villageBubbleRoom(box, avoid, rough.x, TOOLBAR.width));
}

/** A tablet's dock: the bar docked at the top right (64 px), the menu under it to the foot, `width` wide. */
function dock(screen: { width: number; height: number }, width: number): BubbleAvoid[] {
  const left = screen.width - width;
  return [
    { rect: rect(left, 0, width, 64), side: true },
    { rect: rect(left, 64, width, screen.height - 64), side: true },
  ];
}

describe("the tile actions keep left of the side menu (#1033)", () => {
  it("at exactly half a 768 x 720 tablet: the toolbar ends before the menu, by the tile", () => {
    const box = rect(0, 0, 768, 720);
    const at = placed(box, dock(box, 384), { x: 350, y: 300 });
    expect(at.x + TOOLBAR.width).toBeLessThanOrEqual(384 - MARGIN_PX);
    // By the tile: above its corner, not pushed under the docked bar's band.
    expect(at.y).toBe(300 - TOOLBAR.height - GAP_PX);
  });

  it("at the menu's 22 rem minimum, past the half of a 640 px tablet", () => {
    const box = rect(0, 0, 640, 720);
    const at = placed(box, dock(box, 352), { x: 300, y: 400 });
    expect(at.x + TOOLBAR.width).toBeLessThanOrEqual(288 - MARGIN_PX);
    expect(at.y).toBe(400 - TOOLBAR.height - GAP_PX);
  });

  it("on a phone: the floating bar keeps it from the top, the sheet from the foot, the full width its own", () => {
    const box = rect(0, 0, 375, 720);
    const avoid: BubbleAvoid[] = [
      { rect: rect(8, 8, 359, 56), side: false },
      { rect: rect(0, 439, 375, 281), side: false },
    ];
    // A tile under the bar: the toolbar under the bar.
    expect(placed(box, avoid, { x: 180, y: 60 }).y).toBe(64 + MARGIN_PX);
    // A tile behind the sheet: the toolbar above it.
    expect(placed(box, avoid, { x: 180, y: 600 }).y).toBe(439 - MARGIN_PX - TOOLBAR.height);
    // The right edge: the screen's.
    expect(placed(box, avoid, { x: 370, y: 300 }).x).toBe(375 - MARGIN_PX - TOOLBAR.width);
  });
});

describe("the side menu is told by its marks", () => {
  afterEach(() => document.body.replaceChildren());

  it("reads data-edit-panel and data-edit-bar, whatever the element's place", () => {
    const mark = (attrs: Record<string, string>) => {
      const e = document.createElement("div");
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      document.body.append(e);
      return e;
    };
    expect(avoidOf(mark({ "data-bubble-avoid": "", "data-edit-panel": "side" })).side).toBe(true);
    expect(avoidOf(mark({ "data-bubble-avoid": "", "data-edit-bar": "docked" })).side).toBe(true);
    expect(avoidOf(mark({ "data-bubble-avoid": "", "data-edit-panel": "sheet" })).side).toBe(false);
    expect(avoidOf(mark({ "data-bubble-avoid": "", "data-edit-bar": "float" })).side).toBe(false);
    expect(avoidOf(mark({ "data-bubble-avoid": "" })).side).toBe(false);
  });
});
