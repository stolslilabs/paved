import { slow } from "../test-slow";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { confirmHoldMs, boardPlates, boardSlots, nextOrientation, nextValid, placementView, useConfirmFlash, type PlacementInput } from "../src/data/placement";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { holdToPlace, preloadPages, validateButton } from "./route-helpers";

// A fixed Training seed (GUARDS, P-71): the first tile of a random seed fits every rotation at every lit slot about one
// time in eleven (180 of 2000 seeds), and the search for a red rotation then finds none. Seed 1 deals a first tile that
// fits two rotations of four at each slot.
vi.mock("@paved/game-core", async (original) => ({
  ...(await original<typeof import("@paved/game-core")>()),
  randomSeed: () => 1n,
}));

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

describe("the plates (PLATES, P-74)", () => {
  it("are the slots, playable whatever the rotation, then every other free cell next to a tile, invalid; none with no slot", () => {
    const tiles = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const plates = boardPlates(tiles, [{ x: 2, y: 0, fits: true }, { x: 0, y: 1, fits: false }, { x: 1, y: 1 }]);
    expect(plates).toEqual([
      { x: 2, y: 0, state: "playable" },
      { x: 0, y: 1, state: "playable" },
      { x: 1, y: 1, state: "playable" },
      { x: -1, y: 0, state: "invalid" },
      { x: 0, y: -1, state: "invalid" },
      { x: 1, y: -1, state: "invalid" },
    ]);
    // A cell is never two plates, never a tile.
    expect(new Set(plates.map((p) => `${p.x},${p.y}`)).size).toBe(plates.length);
    // No tile in hand (no list): no plate. A tile in hand that fits nowhere (an empty list): invalid plates all around.
    expect(boardPlates(tiles, undefined)).toEqual([]);
    const none = boardPlates(tiles, []);
    expect(none.length).toBeGreaterThan(0);
    expect(none.every((p) => p.state === "invalid")).toBe(true);
  });
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

  it("placed: white while the rotation fits, red while it does not, and Confirm disabled while red", () => {
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

  it("rotates through all four rotations (the Tutorial's own rules)", () => {
    expect([1, 2, 3, 4].map(nextOrientation)).toEqual([2, 3, 4, 1]);
  });

  it("rotates clockwise through the valid rotations only", () => {
    expect([1, 2, 3, 4].map((o) => nextValid(o, [1, 3]))).toEqual([3, 3, 1, 1]);
    expect([1, 2, 3, 4].map((o) => nextValid(o, [2]))).toEqual([2, 2, 2, 2]);
    expect(nextValid(4, [1, 2, 3, 4])).toBe(1);
    expect(nextValid(3, [])).toBe(3);
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
  it("never goes red: Rotate stays on valid rotations, Close puts the tile back; Place flashes the cell green", async () => {
    const store = memoryStore();
    render(<App router={createTestRouter("/training")} sources={fakeSources({ store: () => store }).sources} />);
    await screen.findByLabelText(/^Board of \d+ tiles$/, {}, { timeout: slow(5000) });
    const slots = () => screen.getAllByRole("button", { name: /^Slot / });
    // Every slot of every rotation is a button, dashed or solid.
    expect(slots().length).toBeGreaterThan(0);
    expect(slots().some((s) => s.getAttribute("data-fits") === "true") || slots().some((s) => s.getAttribute("data-fits") === "false")).toBe(true);

    // Every slot: chosen, it is placed in a rotation that fits; Rotate (when offered) never turns it red.
    for (let i = 0; i < slots().length; i++) {
      await userEvent.click(slots()[i]!);
      const label = slots()[i]!.getAttribute("aria-label");
      const chosen = () => screen.getByRole("button", { name: label! });
      expect(chosen()).toHaveAttribute("data-placed", "pending");
      await screen.findByRole("button", { name: "Cancel placement" });
      expect(validateButton()).toBeEnabled();
      for (let turn = 0; turn < 4 && screen.queryByRole("button", { name: "Rotate tile" }); turn++) {
        await userEvent.click(screen.getByRole("button", { name: "Rotate tile" }));
        expect(chosen()).toHaveAttribute("data-placed", "pending");
        expect(validateButton()).toBeEnabled();
      }
      // Close: the tile is back in hand, nothing is placed.
      await userEvent.click(screen.getByRole("button", { name: "Cancel placement" }));
      expect(screen.queryByRole("button", { name: "Cancel placement" })).not.toBeInTheDocument();
      expect(validateButton()).toBeNull();
      expect(slots()[i]).not.toHaveAttribute("data-placed");
    }

    await userEvent.click(slots()[0]!);
    await holdToPlace();
    // The placed cell flashes green, then the flash goes; under reduced motion its fade is short.
    const flash = await waitFor(() => {
      const el = document.querySelector("[data-confirm]");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(flash.className).toMatch(/motion-reduce:duration-150/);
    await waitFor(() => expect(document.querySelector("[data-confirm]")).toBeNull(), { timeout: confirmHoldMs() + slow(1000) });
  }, slow(30_000));
});
