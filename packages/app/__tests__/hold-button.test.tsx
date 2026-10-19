import { act, fireEvent, render, screen } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_MS, HoldButton } from "../src/components/elements/hold-button";
import { TileBubble } from "../src/components/containers/tile-bubble";

// PLACE-POLISH (#568): Validate is held, never tapped.
const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const button = () => screen.getByRole("button", { name: "Hold to place the tile" });
const ring = () => button().querySelector("[data-ring-progress]") as SVGCircleElement;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(props: Partial<Parameters<typeof HoldButton>[0]> = {}) {
  const onComplete = vi.fn();
  render(wrap(<HoldButton label="Hold to place the tile" onComplete={onComplete} {...props} />));
  return onComplete;
}

describe("HoldButton", () => {
  it("acts once after a hold of HOLD_MS (about 0.8 s), filling the ring; the click that ends the press does nothing more", () => {
    expect(HOLD_MS).toBe(800);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    const onComplete = setup();
    expect(button()).toHaveAttribute("data-state", "idle");
    fireEvent.pointerDown(button(), { button: 0 });
    expect(button()).toHaveAttribute("data-state", "holding");
    expect(ring().style.strokeDashoffset).toBe("0");
    expect(ring().style.transition).toContain(`${HOLD_MS}ms linear`);
    act(() => vi.advanceTimersByTime(HOLD_MS - 1));
    expect(onComplete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(vibrate).toHaveBeenCalledOnce();
    expect(button()).toHaveAttribute("data-state", "done");
    fireEvent.pointerUp(button(), { button: 0 });
    fireEvent.click(button(), { detail: 1 });
    act(() => vi.advanceTimersByTime(HOLD_MS * 2));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(button()).toHaveAttribute("data-state", "idle");
  });

  it("a short press, or the pointer leaving, cancels: the ring rewinds and nothing happens", () => {
    const onComplete = setup();
    fireEvent.pointerDown(button(), { button: 0 });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerUp(button(), { button: 0 });
    fireEvent.click(button(), { detail: 1 });
    expect(button()).toHaveAttribute("data-state", "idle");
    expect(Number(ring().style.strokeDashoffset)).toBeGreaterThan(0);
    fireEvent.pointerDown(button(), { button: 0 });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerLeave(button());
    fireEvent.pointerDown(button(), { button: 0 });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerCancel(button());
    act(() => vi.advanceTimersByTime(HOLD_MS * 2));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("holding Enter or Space acts; a key let go early cancels; the key's repeats do not restart the hold", () => {
    const onComplete = setup();
    for (const key of ["Enter", " "]) {
      fireEvent.keyDown(button(), { key });
      act(() => vi.advanceTimersByTime(400));
      fireEvent.keyDown(button(), { key, repeat: true });
      act(() => vi.advanceTimersByTime(399));
      fireEvent.keyUp(button(), { key });
      act(() => vi.advanceTimersByTime(HOLD_MS));
    }
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.keyDown(button(), { key: " " });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.keyDown(button(), { key: " ", repeat: true });
    act(() => vi.advanceTimersByTime(400));
    expect(onComplete).toHaveBeenCalledOnce();
    fireEvent.keyUp(button(), { key: " " });
  });

  it("a screen reader's activation (a click with no press before it) acts at once", () => {
    const onComplete = setup();
    fireEvent.click(button());
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("disabled or busy: no hold; busy shows the spinner and aria-busy; going busy mid-hold drops the hold", () => {
    const onComplete = vi.fn();
    const { rerender } = render(wrap(<HoldButton label="Hold to place the tile" onComplete={onComplete} disabled />));
    expect(button()).toBeDisabled();
    fireEvent.pointerDown(button(), { button: 0 });
    fireEvent.click(button());
    rerender(wrap(<HoldButton label="Hold to place the tile" onComplete={onComplete} />));
    fireEvent.pointerDown(button(), { button: 0 });
    act(() => vi.advanceTimersByTime(400));
    rerender(wrap(<HoldButton label="Hold to place the tile" onComplete={onComplete} busy />));
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(onComplete).not.toHaveBeenCalled();
    expect(button()).toHaveAttribute("aria-busy", "true");
    expect(button()).toBeDisabled();
    expect(button().querySelector(".animate-spin")).not.toBeNull();
  });

  it("calls the latest action when the hold completes, never the one of the render it started in", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(wrap(<HoldButton label="Hold to place the tile" onComplete={first} />));
    fireEvent.pointerDown(button(), { button: 0 });
    act(() => vi.advanceTimersByTime(400));
    rerender(wrap(<HoldButton label="Hold to place the tile" onComplete={latest} />));
    act(() => vi.advanceTimersByTime(400));
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });

  it("a change of what it validates (holdKey) mid-hold drops the hold: the ring rewinds, nothing happens until a new press", () => {
    const onComplete = vi.fn();
    const { rerender } = render(wrap(<HoldButton label="Hold to place the tile" onComplete={onComplete} holdKey="a" />));
    fireEvent.keyDown(button(), { key: " " });
    act(() => vi.advanceTimersByTime(400));
    rerender(wrap(<HoldButton label="Hold to place the tile" onComplete={onComplete} holdKey="b" />));
    expect(button()).toHaveAttribute("data-state", "idle");
    // The key still held repeats: no restart.
    fireEvent.keyDown(button(), { key: " ", repeat: true });
    act(() => vi.advanceTimersByTime(HOLD_MS * 2));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.keyUp(button(), { key: " " });
    // A new press holds the whole length again, and acts.
    fireEvent.keyDown(button(), { key: " " });
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("no callout, no selection, no touch gesture under it", () => {
    setup();
    expect(button().className).toMatch(/select-none/);
    expect(button().className).toMatch(/touch-none/);
    expect(button().className).toContain("[-webkit-touch-callout:none]");
  });
});

describe("the bubble's buttons (#568)", () => {
  it("Close, Rotate, Validate in that order, each with the white hover, pressed and focus states; Validate held places once", () => {
    const onConfirm = vi.fn();
    render(wrap(<TileBubble rotations={2} onRotate={vi.fn()} onClose={vi.fn()} onConfirm={onConfirm} />));
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Cancel placement", "Rotate tile", "Hold to place the tile"]);
    for (const b of screen.getAllByRole("button")) {
      // The white hover and pressed states of #537 (`state-layer`), over Validate's gold fill too, and the focus ring.
      expect(b.className).toMatch(/\bstate-layer\b/);
      expect(b.className).toMatch(/focus-visible:ring-2/);
    }
    fireEvent.pointerDown(button(), { button: 0 });
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("rotating during a hold on Validate (R, Space held) drops the hold: the old rotation is never placed", () => {
    // As the pages do: each rotation makes a new confirm for the move now shown.
    const placed: number[] = [];
    function Page() {
      const [orientation, setOrientation] = useState(1);
      return (
        <TileBubble
          rotations={2}
          orientation={orientation}
          onRotate={() => setOrientation((o) => (o === 1 ? 3 : 1))}
          onClose={vi.fn()}
          onConfirm={() => placed.push(orientation)}
        />
      );
    }
    render(wrap(<Page />));
    button().focus();
    fireEvent.keyDown(button(), { key: " " });
    act(() => vi.advanceTimersByTime(400));
    // R pressed with the focus still on Validate: it reaches the bubble's key handler.
    fireEvent.keyDown(button(), { key: "r" });
    act(() => vi.advanceTimersByTime(HOLD_MS * 2));
    expect(placed).toEqual([]);
    expect(button()).toHaveAttribute("data-state", "idle");
    fireEvent.keyUp(button(), { key: " " });
    // Held again on the rotation shown: that one is placed.
    fireEvent.keyDown(button(), { key: " " });
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(placed).toEqual([3]);
  });

  it("clicking Rotate during a pointer hold drops it too", () => {
    const onConfirm = vi.fn();
    render(wrap(<TileBubble rotations={2} onRotate={vi.fn()} onClose={vi.fn()} onConfirm={onConfirm} />));
    fireEvent.pointerDown(button(), { button: 0 });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.click(screen.getByRole("button", { name: "Rotate tile" }));
    act(() => vi.advanceTimersByTime(HOLD_MS * 2));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("one rotation: Close and Validate; Validate disabled until the tile can be placed, busy while it is sent", () => {
    const { rerender } = render(wrap(<TileBubble rotations={1} onRotate={vi.fn()} onClose={vi.fn()} onConfirm={vi.fn()} canConfirm={false} />));
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(button()).toBeDisabled();
    rerender(wrap(<TileBubble rotations={1} onRotate={vi.fn()} onClose={vi.fn()} onConfirm={vi.fn()} busy />));
    expect(button()).toHaveAttribute("aria-busy", "true");
  });
});
