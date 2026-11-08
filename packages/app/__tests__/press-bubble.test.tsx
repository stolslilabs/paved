/**
 * PRESS-BUILD: the long press's Edit village by a tile of the home village (LONGPRESS-EDIT, #799) is one of the tile's actions
 * (TILE-ACTIONS): the painted round button, its painted ring, at Confirm's place round the tile by the tile actions' own rules for one
 * button (`layoutTileAction`), read back from the DOM as rendered, on the 3D board and on the plan view, clear of the home's HUD.
 */
import { render } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameScene } from "@paved/renderer";
import { PRESS_SIDE, PressBubble } from "../src/components/containers/press-bubble";
import { ACTION_GAP_PX, ACTION_PX, MARGIN_PX, actionsClearance, layoutTileAction, layoutTileActions, tileActionPlaces, type BubbleAvoid, type Point } from "../src/components/containers/tile-actions-layout";
import type { Hold, HoldState } from "../src/lib/use-hold";
import { projectCell } from "./camera-fakes";

const R = ACTION_PX / 2;
const WIDTH = 375;
const HEIGHT = 812;
type Box = { left: number; top: number; width: number; height: number };
const domRect = ({ left, top, width, height }: Box) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/**
 * The home's HUD at 375 x 812, each piece as the view marks it (`data-bubble-avoid`), measured on the home: the profile, the balances
 * and the capsules at the top; the dial, the Chat tab, the mission, Explore and the dock at the foot; the right column of tiles across
 * the middle, a side.
 */
const HUD: (Box & { side?: true })[] = [
  { left: 5, top: 8, width: 245, height: 64 },
  { left: 262, top: 8, width: 106, height: 80 },
  { left: 8, top: 128, width: 98, height: 80 },
  { left: 8, top: 500, width: 94, height: 95 },
  { left: 0, top: 605, width: 55, height: 63 },
  { left: 10, top: 675, width: 275, height: 40 },
  { left: 310, top: 672, width: 50, height: 48 },
  { left: 0, top: 720, width: WIDTH, height: 92 },
  { left: 305, top: 270, width: 60, height: 275, side: true },
];
const AVOID: BubbleAvoid[] = HUD.map(({ side, ...box }) => ({ rect: domRect(box), side: !!side }));
const SCREEN = domRect({ left: 0, top: 0, width: WIDTH, height: HEIGHT });

/** The plan view's scrolling region and the pressed cell's box in it. */
let region: Box = { left: 0, top: 0, width: WIDTH, height: HEIGHT };
let cellBox: Box = { left: 160, top: 360, width: 52, height: 52 };

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute("data-press-bubble")) return domRect(this.closest("[data-slot=scroll-region]") ? cellBox : SCREEN);
    if (this.dataset.slot === "scroll-region") return domRect(region);
    const own = this.dataset.rect;
    return domRect(own ? (JSON.parse(own) as Box) : { left: 0, top: 0, width: 0, height: 0 });
  });
});
afterEach(() => vi.restoreAllMocks());

const hold = (state: HoldState = "holding"): Hold => ({ state, holdMs: 800, start: () => true, release: () => {}, cancel: () => {}, completed: () => false, act: () => {} });

const hud = () =>
  HUD.map(({ side, ...r }, i) => <div key={i} data-bubble-avoid={side ? "side" : ""} data-rect={JSON.stringify(r)} />);

/** The button's centre as rendered, from its transform (`origin`: where the bubble's own box starts, the plan's cell). */
function centre(container: HTMLElement, origin = { x: 0, y: 0 }): Point {
  const side = container.querySelector<HTMLElement>(`[data-side="${PRESS_SIDE}"]`)!;
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(side.style.transform);
  expect(m).not.toBeNull();
  expect(side.style.visibility).toBe("visible");
  return { x: Number(m![1]) + R + origin.x, y: Number(m![2]) + R + origin.y };
}

/** The button by a tile whose outline on screen is `outline`, on the 3D board with the home's HUD. */
function onScene(outline: Point[], state?: HoldState) {
  const scene = { projectCellOutline: () => outline.map((p) => ({ ...p, visible: true })), onCameraChange: () => () => {} } as unknown as GameScene;
  return render(
    <LazyMotion features={domMax}>
      {hud()}
      <PressBubble label="Edit village" art="tile-edit" hold={hold(state)} phase="holding" onTap={() => {}} onDismiss={() => {}} scene={scene} cell={{ x: 0, y: 0 }} />
    </LazyMotion>,
  );
}

const meets = (p: Point, r: Box) => p.x + R > r.left && p.x - R < r.left + r.width && p.y + R > r.top && p.y - R < r.top + r.height;
const gap = (p: Point, outline: Point[]) => actionsClearance({ "top-left": p, "top-right": p, "bottom-left": p, "bottom-right": p }, outline);
const shift = (outline: Point[], dx: number, dy: number) => outline.map((p) => ({ x: p.x + dx, y: p.y + dy }));

describe("the long press's Edit village is one of the tile's actions (PRESS-BUILD)", () => {
  it("is the painted round button with the painted ring: the white hammer on the blue disc, its name Edit village", () => {
    const { container, getByRole } = onScene(projectCell(120, WIDTH, HEIGHT));
    const button = getByRole("button", { name: "Edit village" });
    expect(button).toHaveAttribute("data-state", "holding");
    expect(button.querySelector('img[data-icon="tile-edit"]')).not.toBeNull();
    expect(button.querySelector("[data-charge]")).not.toBeNull();
    expect(button.querySelector('[data-ring-progress][data-tube="gold"]')).not.toBeNull();
    // No Font Awesome hammer, no card behind it.
    expect(container.querySelector('[data-icon="hammer"]')).toBeNull();
    expect(container.querySelector("[data-press-bubble]")!.className).not.toMatch(/bg-card|border/);
  });

  it("stands at Confirm's place round the tile, by the tile actions' own rules", () => {
    for (const outline of [projectCell(300, WIDTH, HEIGHT), projectCell(120, WIDTH, HEIGHT), projectCell(40, WIDTH, HEIGHT, { x: 1, z: 0.5 })]) {
      const { container, unmount } = onScene(outline);
      // Nothing in its way: exactly Confirm's place, as a placed tile's actions stand.
      const at = tileActionPlaces(outline)[PRESS_SIDE];
      expect(layoutTileAction(PRESS_SIDE, outline, SCREEN, AVOID)).toEqual(at);
      expect(layoutTileActions(outline, SCREEN, AVOID)[PRESS_SIDE]).toEqual(at);
      const p = centre(container);
      expect(Math.abs(p.x - at.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(p.y - at.y)).toBeLessThanOrEqual(0.5);
      // Up and to the right of the tile's centre.
      const mid = outline.reduce((s, q) => ({ x: s.x + q.x / 4, y: s.y + q.y / 4 }), { x: 0, y: 0 });
      expect(p.x).toBeGreaterThan(mid.x);
      expect(p.y).toBeLessThan(mid.y);
      unmount();
    }
  });

  it(`keeps ${ACTION_GAP_PX} screen px from the tile at every zoom`, () => {
    for (const distance of [300, 120, 40]) {
      const outline = projectCell(distance, WIDTH, HEIGHT);
      const { container, unmount } = onScene(outline);
      expect(Math.abs(gap(centre(container), outline) - ACTION_GAP_PX), `distance ${distance}`).toBeLessThanOrEqual(1);
      unmount();
    }
  });

  it("is kept clear of the home's HUD and the dock, by every piece of it, and on the screen", () => {
    const small = projectCell(300, WIDTH, HEIGHT);
    const mid = small.reduce((s, q) => ({ x: s.x + q.x / 4, y: s.y + q.y / 4 }), { x: 0, y: 0 });
    // The tile under the profile, by the balances, by the capsules, by the right column, by the dial, by the mission and the dock.
    for (const [x, y] of [
      [120, 40],
      [300, 60],
      [60, 220],
      [330, 300],
      [280, 420],
      [60, 560],
      [200, 700],
      [340, 690],
    ] as const) {
      const outline = shift(small, x - mid.x, y - mid.y);
      const { container, unmount } = onScene(outline);
      const p = centre(container);
      for (const r of HUD) expect(meets(p, r), `tile at ${x},${y}: under ${JSON.stringify(r)}`).toBe(false);
      expect(p.x - R).toBeGreaterThanOrEqual(MARGIN_PX - 1);
      expect(p.x + R).toBeLessThanOrEqual(WIDTH - MARGIN_PX + 1);
      expect(p.y - R).toBeGreaterThanOrEqual(MARGIN_PX - 1);
      expect(p.y + R).toBeLessThanOrEqual(HEIGHT - MARGIN_PX + 1);
      expect(gap(p, outline), `tile at ${x},${y}: on the tile`).toBeGreaterThanOrEqual(ACTION_GAP_PX - 1);
      unmount();
    }
  });

  it("alone, no absent action moves it: by a tile under the HUD it stays beside the tile, the nearest place to its own", () => {
    const small = projectCell(300, WIDTH, HEIGHT);
    const mid = small.reduce((s, q) => ({ x: s.x + q.x / 4, y: s.y + q.y / 4 }), { x: 0, y: 0 });
    // Under Vault (the right column), under the balances, by the capsules: its own place is under the HUD.
    for (const [x, y] of [
      [300, 370],
      [250, 110],
      [130, 240],
    ] as const) {
      const outline = shift(small, x - mid.x, y - mid.y);
      const own = tileActionPlaces(outline)[PRESS_SIDE];
      const { container, unmount } = onScene(outline);
      const p = centre(container);
      expect(p, `tile at ${x},${y}`).not.toEqual(own);
      // Beside the tile: no farther than the gap and half a button (the four actions' packing, absent three included, put it far off).
      expect(gap(p, outline), `tile at ${x},${y}`).toBeGreaterThanOrEqual(ACTION_GAP_PX - 1);
      expect(gap(p, outline), `tile at ${x},${y}`).toBeLessThanOrEqual(ACTION_GAP_PX + R);
      for (const r of HUD) expect(meets(p, r), `tile at ${x},${y}: under ${JSON.stringify(r)}`).toBe(false);
      unmount();
    }
  });

  it("the plan view: the same place round the pressed cell, the plan's scrolling region its room, the HUD clear", () => {
    for (const cell of [
      { left: 160, top: 360, width: 52, height: 52 },
      { left: 290, top: 300, width: 52, height: 52 },
      { left: 40, top: 100, width: 40, height: 40 },
    ]) {
      region = { left: 0, top: 0, width: WIDTH, height: HEIGHT };
      cellBox = cell;
      const { container, unmount } = render(
        <LazyMotion features={domMax}>
          {hud()}
          <div data-slot="scroll-region">
            <div className="relative">
              <PressBubble label="Edit village" art="tile-edit" hold={hold()} phase="holding" onTap={() => {}} onDismiss={() => {}} />
            </div>
          </div>
        </LazyMotion>,
      );
      const outline = [
        { x: cell.left, y: cell.top },
        { x: cell.left + cell.width, y: cell.top },
        { x: cell.left + cell.width, y: cell.top + cell.height },
        { x: cell.left, y: cell.top + cell.height },
      ];
      const at = layoutTileAction(PRESS_SIDE, outline, domRect(region), AVOID);
      const p = centre(container, { x: cell.left, y: cell.top });
      expect(Math.abs(p.x - at.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(p.y - at.y)).toBeLessThanOrEqual(0.5);
      expect(container.querySelector("[data-press-bubble]")).not.toHaveAttribute("data-follows");
      for (const r of HUD) expect(meets(p, r), `cell ${JSON.stringify(cell)}: under ${JSON.stringify(r)}`).toBe(false);
      expect(gap(p, outline)).toBeGreaterThanOrEqual(ACTION_GAP_PX - 1);
      unmount();
    }
  });

  it("lingering, its ring rewound: the painted ring empty, the button there to tap", () => {
    const { getByRole } = onScene(projectCell(120, WIDTH, HEIGHT), "idle");
    const button = getByRole("button", { name: "Edit village" });
    expect(button).toHaveAttribute("data-state", "idle");
    expect(button.querySelector<SVGElement>("[data-ring-progress]")!.style.opacity).toBe("0");
  });
});
