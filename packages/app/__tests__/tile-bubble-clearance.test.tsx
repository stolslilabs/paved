/**
 * The tile's actions as `TileBubble` renders them (#1078): the buttons' final transforms, read back from the DOM, against the tile's
 * outline as the production camera projects it at the closest distance (10) and the farthest (300), on 320, 360 and 375 px phones, on
 * the board (its HUD and hand panel) and in the home editor (its floating bar and sheet).
 */
import { render } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameScene } from "@paved/renderer";
import { TileBubble } from "../src/components/containers/tile-bubble";
import { ACTION_GAP_PX, ACTION_PX, ACTION_SIDES, MARGIN_PX, actionsClearance, type ActionPlaces, type Point } from "../src/components/containers/tile-actions-layout";
import { projectCell } from "./camera-fakes";

const R = ACTION_PX / 2;
const HEIGHT = 720;
type Box = { left: number; top: number; width: number; height: number };
const domRect = ({ left, top, width, height }: Box) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/** The parts of the screen the actions avoid, by room: the board's HUD and hand panel, the home editor's floating bar and sheet. */
const ROOMS: Record<string, (w: number) => Box[]> = {
  board: (w) => [
    { left: 0, top: 0, width: w, height: 96 },
    { left: 8, top: 520, width: w - 16, height: 200 },
  ],
  "home editor": (w) => [
    { left: 8, top: 8, width: w - 16, height: 56 },
    { left: 0, top: 439, width: w, height: 281 },
  ],
};

let width = 375;
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute("data-tile-actions")) return domRect({ left: 0, top: 0, width, height: HEIGHT });
    const own = this.dataset.rect;
    return domRect(own ? (JSON.parse(own) as Box) : { left: 0, top: 0, width: 0, height: 0 });
  });
});
afterEach(() => vi.restoreAllMocks());

/** The four buttons' centres as rendered, for a tile whose outline on screen is `outline`. */
function rendered(outline: Point[], avoid: Box[], editor: boolean): ActionPlaces {
  const scene = { projectCellOutline: () => outline.map((p) => ({ ...p, visible: true })), onCameraChange: () => () => {} } as unknown as GameScene;
  const { container } = render(
    <LazyMotion features={domMax}>
      {avoid.map((r, i) => (
        <div key={i} data-bubble-avoid="" data-rect={JSON.stringify(r)} />
      ))}
      <TileBubble
        rotations={2}
        onRotate={() => {}}
        onClose={() => {}}
        scene={scene}
        cell={{ x: 0, y: 0 }}
        {...(editor ? { onReturn: () => {} } : { onConfirm: () => {}, onDiscard: () => {} })}
      />
    </LazyMotion>,
  );
  const at = {} as ActionPlaces;
  for (const side of ACTION_SIDES) {
    const button = container.querySelector<HTMLElement>(`[data-side="${side}"]`);
    if (!button) continue;
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(button.style.transform);
    expect(m, side).not.toBeNull();
    at[side] = { x: Number(m![1]) + R, y: Number(m![2]) + R };
  }
  return at;
}

const meets = (p: Point, r: Box) => p.x + R > r.left && p.x - R < r.left + r.width && p.y + R > r.top && p.y - R < r.top + r.height;

describe("the actions' final clearance as rendered (#1078)", () => {
  for (const [name, avoidFor] of Object.entries(ROOMS))
    for (const w of [320, 360, 375]) {
      const check = (outline: Point[], gap: (clearance: number) => void) => {
        width = w;
        const avoid = avoidFor(w);
        const at = rendered(outline, avoid, name === "home editor");
        const sides = Object.keys(at) as (keyof ActionPlaces)[];
        expect(sides.length).toBeGreaterThanOrEqual(3);
        let least = Infinity;
        for (const side of sides) {
          const p = at[side];
          least = Math.min(least, actionsClearance({ "top-left": p, "top-right": p, "bottom-left": p, "bottom-right": p }, outline));
          expect(p.x - R, side).toBeGreaterThanOrEqual(MARGIN_PX - 1);
          expect(p.x + R, side).toBeLessThanOrEqual(w - MARGIN_PX + 1);
          for (const r of avoid) expect(meets(p, r), `${side} under ${JSON.stringify(r)}`).toBe(false);
        }
        gap(least);
      };

      it(`${name}, ${w} px, distance 300: ${ACTION_GAP_PX} px from the tile`, () => {
        check(projectCell(300, w, HEIGHT), (least) => expect(Math.abs(least - ACTION_GAP_PX)).toBeLessThanOrEqual(1));
      });

      it(`${name}, ${w} px, distance 10, the tile's edge on screen: at least ${ACTION_GAP_PX} px from the tile`, () => {
        for (const target of [
          { x: 1.5, z: 0 },
          { x: -1.5, z: 0 },
          { x: 0, z: -2 },
        ])
          check(projectCell(10, w, HEIGHT, target), (least) => expect(least, JSON.stringify(target)).toBeGreaterThanOrEqual(ACTION_GAP_PX - 1));
      });
    }
});
