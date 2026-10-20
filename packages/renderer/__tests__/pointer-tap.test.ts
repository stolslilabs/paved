import { describe, expect, it, vi } from "vitest";
import { PointerTap, type TilePressPhase } from "../src/core/interaction";
import type { SurfaceInputEvent } from "../src/core/types";

/** A tap tracker on a board whose cells are 100 px squares, its presses and clicks recorded. */
function tracker(acts: (phase: TilePressPhase) => boolean | void = () => undefined) {
  const presses: [number, number, TilePressPhase][] = [];
  const clicks: [number, number][] = [];
  const tap = new PointerTap(
    {
      toGrid: (p) => ({ x: Math.floor(p.x / 100), y: Math.floor(p.y / 100) }),
      onPress: (x, y, phase) => {
        presses.push([x, y, phase]);
        return acts(phase);
      },
      onClick: (x, y) => clicks.push([x, y]),
    },
    5,
  );
  const send = (type: SurfaceInputEvent["type"], x: number, y: number, extra: Partial<SurfaceInputEvent> = {}) => tap.handle({ type, x, y, button: 0, pointerId: 1, ...extra });
  return { presses, clicks, send };
}

describe("PointerTap (TILE-HOLD, #630)", () => {
  it("reports a press from the down, then released, and a short tap still clicks the cell", () => {
    const t = tracker();
    t.send("pointerdown", 150, 250);
    expect(t.presses).toEqual([[1, 2, "down"]]);
    t.send("pointerup", 152, 251);
    expect(t.presses).toEqual([
      [1, 2, "down"],
      [1, 2, "released"],
    ]);
    expect(t.clicks).toEqual([[1, 2]]);
  });

  it("keeps the click when the press listener acted on release (a completed hold)", () => {
    const t = tracker((phase) => phase === "released");
    t.send("pointerdown", 150, 250);
    t.send("pointerup", 150, 250);
    expect(t.presses.at(-1)).toEqual([1, 2, "released"]);
    expect(t.clicks).toEqual([]);
  });

  it("cancels the press when the pointer moves past the click threshold (a pan), and the pan does not click", () => {
    const t = tracker();
    t.send("pointerdown", 150, 250);
    t.send("pointermove", 153, 252);
    expect(t.presses).toEqual([[1, 2, "down"]]);
    t.send("pointermove", 160, 250);
    expect(t.presses).toEqual([
      [1, 2, "down"],
      [1, 2, "cancelled"],
    ]);
    t.send("pointermove", 400, 250);
    t.send("pointerup", 400, 250);
    expect(t.presses).toHaveLength(2);
    expect(t.clicks).toEqual([]);
  });

  it("cancels the press on a second finger (a pinch or the tilt), and the gesture never clicks", () => {
    const t = tracker();
    t.send("pointerdown", 150, 250);
    t.send("pointerdown", 300, 300, { pointerId: 2 });
    expect(t.presses).toEqual([
      [1, 2, "down"],
      [1, 2, "cancelled"],
    ]);
    t.send("pointerup", 300, 300, { pointerId: 2 });
    t.send("pointerup", 150, 250);
    expect(t.presses).toHaveLength(2);
    expect(t.clicks).toEqual([]);
  });

  it("takes the left button only: the right one (the tilt) neither presses nor clicks, and ends a press under way", () => {
    const t = tracker();
    t.send("pointerdown", 150, 250, { button: 2 });
    t.send("pointerup", 150, 250, { button: 2 });
    expect(t.presses).toEqual([]);
    expect(t.clicks).toEqual([]);
    t.send("pointerdown", 150, 250);
    t.send("pointerdown", 150, 250, { button: 2 });
    expect(t.presses.at(-1)).toEqual([1, 2, "cancelled"]);
  });

  it("cancels the press when the browser cancels the pointer or it leaves the surface", () => {
    const t = tracker();
    t.send("pointerdown", 150, 250);
    t.send("pointercancel", 150, 250);
    expect(t.presses.at(-1)).toEqual([1, 2, "cancelled"]);
    t.send("pointerup", 150, 250);
    expect(t.clicks).toEqual([]);
    t.send("pointerdown", 50, 50);
    t.send("pointerleave", 0, 0);
    expect(t.presses.at(-1)).toEqual([0, 0, "cancelled"]);
  });

  it("ends each press once: a cancelled press reports no release", () => {
    const onPress = vi.fn();
    const tap = new PointerTap({ toGrid: () => ({ x: 0, y: 0 }), onPress }, 5);
    tap.handle({ type: "pointerdown", x: 0, y: 0, button: 0, pointerId: 1 });
    tap.handle({ type: "pointermove", x: 20, y: 0, pointerId: 1 });
    tap.handle({ type: "pointerleave", x: 0, y: 0 });
    tap.handle({ type: "pointerup", x: 20, y: 0, button: 0, pointerId: 1 });
    expect(onPress.mock.calls.map((c) => c[2])).toEqual(["down", "cancelled"]);
  });

  it("presses nothing off the ground", () => {
    const onPress = vi.fn();
    const onClick = vi.fn();
    const tap = new PointerTap({ toGrid: () => null, onPress, onClick }, 5);
    tap.handle({ type: "pointerdown", x: 0, y: 0, button: 0, pointerId: 1 });
    tap.handle({ type: "pointerup", x: 0, y: 0, button: 0, pointerId: 1 });
    expect(onPress).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
