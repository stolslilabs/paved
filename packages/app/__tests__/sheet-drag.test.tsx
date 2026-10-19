import { fireEvent, render, screen } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet, SHEET_DRAG, SheetContent, SheetHeader, SheetTitle, sheetDragAllowed, sheetDragCloses } from "../src/components/ui/sheet";

describe("sheetDragCloses (#581)", () => {
  it("closes past a quarter of the height, or 120 px on a tall panel", () => {
    expect(sheetDragCloses(99, 0, 400)).toBe(false);
    expect(sheetDragCloses(100, 0, 400)).toBe(true);
    expect(sheetDragCloses(119, 0, 700)).toBe(false);
    expect(sheetDragCloses(120, 0, 700)).toBe(true);
  });

  it("closes on a downward flick however short, and never on an upward one", () => {
    expect(sheetDragCloses(20, SHEET_DRAG.velocity, 700)).toBe(true);
    expect(sheetDragCloses(20, SHEET_DRAG.velocity - 0.01, 700)).toBe(false);
    expect(sheetDragCloses(300, -SHEET_DRAG.velocity, 700)).toBe(false);
    expect(sheetDragCloses(0, 2, 700)).toBe(false);
  });
});

describe("sheetDragAllowed, the scroll guard (#581)", () => {
  const panel = () => {
    const root = document.createElement("div");
    root.innerHTML = `<div id="panel"><div data-slot="sheet-grab-bar"><span id="bar"></span></div><div data-slot="sheet-header"><h2 id="title">T</h2></div><div id="list"><p id="row">Row</p></div><span role="slider" id="slider"></span></div>`;
    document.body.append(root);
    return { root, get: (id: string) => root.querySelector(`#${id}`)! };
  };

  it("lets the content drag only while nothing is scrolled", () => {
    const { root, get } = panel();
    expect(sheetDragAllowed(get("row"), get("panel"))).toBe(true);
    get("panel").scrollTop = 40;
    expect(sheetDragAllowed(get("row"), get("panel"))).toBe(false);
    get("panel").scrollTop = 0;
    get("list").scrollTop = 10;
    expect(sheetDragAllowed(get("row"), get("panel"))).toBe(false);
    root.remove();
  });

  it("always lets the grab bar and the header drag, and never a slider", () => {
    const { root, get } = panel();
    get("panel").scrollTop = 40;
    expect(sheetDragAllowed(get("bar"), get("panel"))).toBe(true);
    expect(sheetDragAllowed(get("title"), get("panel"))).toBe(true);
    get("panel").scrollTop = 0;
    expect(sheetDragAllowed(get("slider"), get("panel"))).toBe(false);
    root.remove();
  });
});

/** One finger at (x, y); the dialog's scroll lock reads `changedTouches`. */
const touch = (clientX: number, clientY: number) => ({ touches: [{ clientX, clientY }], changedTouches: [{ clientX, clientY }] });

describe("Bottom sheet drag (#581)", () => {
  let now = 0;
  afterEach(() => vi.restoreAllMocks());

  const open = (side: "bottom" | "right" = "bottom", reducedMotion: "never" | "always" = "never") => {
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const onOpenChange = vi.fn();
    render(
      <MotionConfig reducedMotion={reducedMotion}>
        <Sheet open onOpenChange={onOpenChange}>
          <SheetContent side={side} aria-describedby={undefined}>
            <SheetHeader>
              <SheetTitle>Settings</SheetTitle>
            </SheetHeader>
            <p>Row</p>
          </SheetContent>
        </Sheet>
      </MotionConfig>,
    );
    const el = screen.getByRole("dialog");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ height: 600 } as DOMRect);
    return { el, onOpenChange };
  };
  /** A finger from y 100 to `to`, `ms` per step of 10 px, then a pause of `rest` ms before it lifts. */
  const swipe = (target: Element, to: number, ms: number, rest = 0) => {
    now = 1000;
    fireEvent.touchStart(target, touch(50, 100));
    for (let y = 110; y <= to; y += 10) {
      now += ms;
      fireEvent.touchMove(target, touch(50, y));
    }
    now += rest;
    fireEvent.touchEnd(target, { touches: [], changedTouches: [{ clientX: 0, clientY: 0 }] });
  };

  it("shows a grab bar on a bottom sheet only", () => {
    const { el } = open();
    expect(el.querySelector("[data-slot=sheet-grab-bar]")).not.toBeNull();
  });

  it("has no grab bar and no drag on a side sheet", () => {
    const { el, onOpenChange } = open("right");
    expect(el.querySelector("[data-slot=sheet-grab-bar]")).toBeNull();
    swipe(screen.getByText("Row"), 400, 50, 200);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(el.style.translate).toBe("");
  });

  it("follows the finger while it drags", () => {
    const { el } = open();
    now = 0;
    fireEvent.touchStart(screen.getByText("Row"), touch(50, 100));
    fireEvent.touchMove(screen.getByText("Row"), touch(52, 180));
    expect(el.style.translate).toBe("0 80px");
    expect(el).toHaveAttribute("data-dragging");
  });

  it("closes a slow drag past the threshold", () => {
    const { onOpenChange } = open();
    swipe(screen.getByText("Row"), 260, 50, 200);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("springs back from a slow drag short of the threshold", () => {
    const { el, onOpenChange } = open();
    swipe(screen.getByText("Row"), 200, 50, 200);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(el.style.translate).toBe("");
    expect(el.style.transition).toContain("translate");
  });

  it("snaps back with no spring under reduced motion", () => {
    const { el, onOpenChange } = open("bottom", "always");
    swipe(screen.getByText("Row"), 200, 50, 200);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(el.style.translate).toBe("");
    expect(el.style.transition).toBe("");
  });

  it("closes a short fast flick", () => {
    const { onOpenChange } = open();
    swipe(screen.getByText("Row"), 140, 10);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("leaves a scrolled content to its own scroll, but the header still drags", () => {
    const { el, onOpenChange } = open();
    el.scrollTop = 120;
    swipe(screen.getByText("Row"), 400, 50, 200);
    expect(el.style.translate).toBe("");
    expect(onOpenChange).not.toHaveBeenCalled();
    swipe(screen.getByText("Settings"), 400, 50, 200);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not drag on an upward or sideways gesture", () => {
    const { el, onOpenChange } = open();
    now = 0;
    fireEvent.touchStart(el, touch(50, 300));
    fireEvent.touchMove(el, touch(50, 200));
    fireEvent.touchMove(el, touch(50, 500));
    fireEvent.touchEnd(el, { touches: [], changedTouches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchStart(el, touch(50, 300));
    fireEvent.touchMove(el, touch(150, 320));
    fireEvent.touchEnd(el, { touches: [], changedTouches: [{ clientX: 0, clientY: 0 }] });
    expect(el.style.translate).toBe("");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("drags with a mouse too", () => {
    const { onOpenChange } = open();
    now = 0;
    fireEvent.pointerDown(screen.getByText("Settings"), { pointerType: "mouse", button: 0, clientX: 50, clientY: 100 });
    now = 500;
    fireEvent.pointerMove(window, { pointerType: "mouse", clientX: 50, clientY: 400 });
    now = 800;
    fireEvent.pointerUp(window, { pointerType: "mouse" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
