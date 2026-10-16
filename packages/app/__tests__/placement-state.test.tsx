import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { confirmHoldMs, boardSlots, nextOrientation, placementView, useConfirmFlash, type PlacementInput } from "../src/data/placement";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { preloadPages } from "./route-helpers";

// The engine's legality, as a table: at (0, 1) the tile fits rotations 1 and 3, at (1, 0) only 2.
const FITS: Record<string, number[]> = { "0,1": [1, 3], "1,0": [2] };
const orientationsAt = (c: { x: number; y: number }) => FITS[`${c.x},${c.y}`] ?? [];
const slotsAt = (o: number) =>
  Object.entries(FITS)
    .filter(([, os]) => os.includes(o))
    .map(([k]) => ({ x: Number(k.split(",")[0]), y: Number(k.split(",")[1]) }));
const input = (over: Partial<PlacementInput> = {}): PlacementInput => ({
  plan: 7,
  slots: boardSlots(slotsAt, over.orientation ?? 1),
  chosen: null,
  hovered: null,
  orientation: 1,
  orientationsAt,
  ...over,
});

describe("the placement state (SLOTS, P-68)", () => {
  it("lights every legal slot in any rotation, solid (fits) where the current rotation fits", () => {
    expect(boardSlots(slotsAt, 1)).toEqual([
      { x: 0, y: 1, fits: true },
      { x: 1, y: 0, fits: false },
    ]);
    expect(boardSlots(slotsAt, 2)).toEqual([
      { x: 0, y: 1, fits: false },
      { x: 1, y: 0, fits: true },
    ]);
    expect(boardSlots(slotsAt, 4).every((s) => !s.fits)).toBe(true);
  });

  it("idle with no tile in hand; in hand, nothing placed and Confirm off", () => {
    expect(placementView(input({ plan: null }))).toEqual({ phase: "idle", move: null, ghost: null, canConfirm: false });
    const inHand = placementView(input());
    expect(inHand.phase).toBe("in-hand");
    expect(inHand.canConfirm).toBe(false);
    expect(inHand.ghost).toBeNull();
  });

  it("a hover previews the rotation a click would choose: never red", () => {
    const hover = placementView(input({ hovered: { x: 1, y: 0 }, orientation: 1 }));
    expect(hover.phase).toBe("in-hand");
    expect(hover.ghost).toMatchObject({ x: 1, y: 0, orientation: 2, placed: false, fits: true });
    expect(hover.canConfirm).toBe(false);
    // A cell that is no slot: nothing.
    expect(placementView(input({ hovered: { x: 5, y: 5 } })).ghost).toBeNull();
  });

  it("placed: yellow while the rotation fits, red while it does not, and Confirm disabled while red", () => {
    const placed = placementView(input({ chosen: { x: 0, y: 1 }, orientation: 1 }));
    expect(placed.phase).toBe("placed");
    expect(placed.ghost).toMatchObject({ placed: true, fits: true });
    expect(placed.canConfirm).toBe(true);
    const red = placementView(input({ chosen: { x: 0, y: 1 }, orientation: 2 }));
    expect(red.phase).toBe("placed-red");
    expect(red.ghost).toMatchObject({ x: 0, y: 1, orientation: 2, placed: true, fits: false });
    expect(red.canConfirm).toBe(false);
    // Rotating back to a rotation that fits: yellow again.
    expect(placementView(input({ chosen: { x: 0, y: 1 }, orientation: 3 })).phase).toBe("placed");
  });

  it("holds the confirm past the renderer's fade, a longer fade included", () => {
    expect(confirmHoldMs()).toBeGreaterThan(700);
    expect(confirmHoldMs(1500)).toBeGreaterThan(1500);
    vi.useFakeTimers();
    const { result } = renderHook(() => useConfirmFlash(1500));
    act(() => result.current[1]({ x: 0, y: 0, plan: 1, orientation: 1 }));
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current[0]).not.toBeNull();
    act(() => vi.advanceTimersByTime(confirmHoldMs(1500) - 1500));
    expect(result.current[0]).toBeNull();
    vi.useRealTimers();
  });

  it("rotates through all four rotations", () => {
    expect([1, 2, 3, 4].map(nextOrientation)).toEqual([2, 3, 4, 1]);
  });

  it("confirm: the board gets the tile for the fade, a new key each time, then nothing", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useConfirmFlash());
    const ghost = { x: 3, y: 4, plan: 7, orientation: 2, placed: true, fits: true };
    act(() => result.current[1](ghost));
    expect(result.current[0]).toMatchObject({ x: 3, y: 4, key: 1, placed: false });
    act(() => result.current[1](ghost));
    expect(result.current[0]!.key).toBe(2);
    act(() => vi.advanceTimersByTime(confirmHoldMs() - 1));
    expect(result.current[0]).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBeNull();
    vi.useRealTimers();
  });
});

preloadPages("board");

beforeEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
});

describe("the Training board's plan view, placing a tile", () => {
  it("is red on a rotation that does not fit, with Place disabled, yellow again on one that does; then flashes green", async () => {
    const store = memoryStore();
    render(<App router={createTestRouter("/training")} sources={fakeSources({ store: () => store }).sources} />);
    await screen.findByLabelText(/^Board of \d+ tiles$/, {}, { timeout: 5000 });
    const hand = () => screen.getByRole("region", { name: "Your tile" });
    const place = () => within(hand()).getByRole("button", { name: /Place tile/ });
    const slots = () => screen.getAllByRole("button", { name: /^Slot / });
    // Every slot of every rotation is a button, dashed or solid.
    expect(slots().length).toBeGreaterThan(0);
    expect(slots().some((s) => s.getAttribute("data-fits") === "true") || slots().some((s) => s.getAttribute("data-fits") === "false")).toBe(true);

    // Find a slot where some rotation does not fit: choose it, then turn until it is red.
    let red = false;
    for (let i = 0; i < slots().length && !red; i++) {
      await userEvent.click(slots()[i]!);
      const label = slots()[i]!.getAttribute("aria-label");
      const chosen = () => screen.getByRole("button", { name: label! });
      expect(chosen()).toHaveAttribute("data-placed", "yellow");
      expect(place()).toBeEnabled();
      for (let turn = 0; turn < 4; turn++) {
        await userEvent.click(within(hand()).getByRole("button", { name: "Rotate tile" }));
        if (chosen().getAttribute("data-placed") === "red") {
          red = true;
          expect(place()).toBeDisabled();
          break;
        }
      }
      if (red) {
        for (let turn = 0; turn < 4 && chosen().getAttribute("data-placed") !== "yellow"; turn++) {
          await userEvent.click(within(hand()).getByRole("button", { name: "Rotate tile" }));
        }
        expect(chosen()).toHaveAttribute("data-placed", "yellow");
        expect(place()).toBeEnabled();
      }
    }
    expect(red).toBe(true);

    await userEvent.click(place());
    // The placed cell flashes green, then the flash goes; under reduced motion its fade is short.
    const flash = await waitFor(() => {
      const el = document.querySelector("[data-confirm]");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(flash.className).toMatch(/motion-reduce:duration-150/);
    await waitFor(() => expect(document.querySelector("[data-confirm]")).toBeNull(), { timeout: confirmHoldMs() + 1000 });
  }, 20_000);
});
