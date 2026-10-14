// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GamePage } from "../src/pages/Game";
import { replay } from "../src/training/local-session";
import { TRAINING_KEY } from "../src/training/storage";

// Everything that could reach a chain throws: the Training path must not call any of it.
const { chainCall } = vi.hoisted(() => ({
  chainCall: (name: string) => () => {
    throw new Error(`${name} was called on the Training path`);
  },
}));
vi.mock("@paved/chain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@paved/chain")>();
  return {
    ...actual,
    createPavedClient: chainCall("createPavedClient"),
    createControllerConnector: chainCall("createControllerConnector"),
    usePaved: chainCall("usePaved"),
    useGameSession: chainCall("useGameSession"),
    useRead: chainCall("useRead"),
    useAsyncRead: chainCall("useAsyncRead"),
    useIndexer: chainCall("useIndexer"),
    useIndexerRead: chainCall("useIndexerRead"),
    nftOf: chainCall("nftOf"),
  };
});
vi.mock("../src/utils/economy-context", () => ({ useEconomy: chainCall("useEconomy") }));
vi.mock("../src/components/GameNft", () => ({ useCollection: chainCall("useCollection"), GameNft: chainCall("GameNft") }));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: ({ availableSlots = [], onTileHover, onTileClick }: { availableSlots?: Array<{ x: number; y: number }>; onTileHover?: (x: number, y: number) => void; onTileClick?: (x: number, y: number) => void }) => (
    <>
      {availableSlots.slice(0, 1).map((s) => (
        <button key={`${s.x},${s.y}`} type="button" onClick={() => (onTileHover?.(s.x, s.y), onTileClick?.(s.x, s.y))}>
          Slot
        </button>
      ))}
    </>
  ),
}));
vi.mock("@paved/ui", async () => {
  // A store that keeps what the page sets (the shared fixture's is frozen): the move is read from it.
  const { useSyncExternalStore } = await import("react");
  let state = {
    orientation: 1, strategyMode: false, x: 0, y: 0, selectedTile: null as { col: number; row: number } | null,
    setOrientation: (o: number) => set({ orientation: ((((o - 1) % 4) + 4) % 4) + 1 }),
    setSelectedTile: (selectedTile: { col: number; row: number } | null) => set({ selectedTile }),
    setX: (x: number) => set({ x }),
    setY: (y: number) => set({ y }),
  };
  const listeners = new Set<() => void>();
  function set(patch: Partial<typeof state>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  }
  const useGameStore = Object.assign(
    <T,>(selector: (s: typeof state) => T): T =>
      useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => selector(state)),
    { getState: () => state },
  );
  return {
    useGameStore,
    IngameStatus: ({ score, built, discarded }: { score: number; built: number; discarded: number }) => (
      <output data-testid="status">{`${score}|${built}|${discarded}`}</output>
    ),
    GameCompleteDialog: chainCall("GameCompleteDialog"),
    ActionBar: ({ onRotate, onConfirm, confirmDisabled, onDiscard }: { onRotate: () => void; onConfirm: () => void; confirmDisabled: boolean; onDiscard: () => void }) => (
      <>
        <button type="button" onClick={onRotate}>Rotate tile</button>
        <button type="button" disabled={confirmDisabled} onClick={onConfirm}>Confirm move</button>
        <button type="button" onClick={onDiscard}>Discard tile</button>
      </>
    ),
  };
});

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const open = () =>
  render(
    <MemoryRouter initialEntries={["/game?mode=training"]}>
      <GamePage />
    </MemoryRouter>,
  );

const status = () => screen.getByTestId("status").textContent!;

/** One step of a player: place on a slot (rotating up to a full turn to find one), else discard. */
async function step() {
  for (let turn = 0; turn < 4; turn++) {
    const slot = screen.queryByText("Slot");
    if (slot) {
      const before = status();
      fireEvent.click(slot);
      const confirm = screen.getByText("Confirm move") as HTMLButtonElement;
      await waitFor(() => expect(confirm.disabled).toBe(false));
      fireEvent.click(confirm);
      await waitFor(() => expect(status()).not.toBe(before));
      return;
    }
    fireEvent.click(screen.getByText("Rotate tile"));
  }
  const before = status();
  fireEvent.click(screen.getByText("Discard tile"));
  await waitFor(() => expect(status()).not.toBe(before));
}

describe("Training game page, with every chain provider throwing", () => {
  it("plays to the end with no wallet, no indexer and no transaction, and shows the final score", async () => {
    open();
    await screen.findByText("Discard tile");
    for (let i = 0; i < 80 && !screen.queryByRole("dialog", { name: "Game complete" }); i++) await step();
    await screen.findByRole("dialog", { name: "Game complete" });
    const shown = Number(screen.getByTestId("final-score").textContent!.replace(/\D/g, ""));
    // The engine, replaying the saved seed and moves, ends on the score the page shows.
    const saved = JSON.parse(localStorage.getItem(TRAINING_KEY)!);
    const game = replay(BigInt(saved.seed), saved.moves);
    expect(game.over).toBe(true);
    expect(shown).toBe(game.score);
    expect(screen.getByText("New game")).toBeTruthy();
    // A whole game of a random seed through jsdom: the first run of a cold cache took more than vitest's 5 s.
  }, 30_000);

  it("surrenders after a confirm, and a new game takes a new seed", async () => {
    open();
    await screen.findByText("Surrender");
    const first = JSON.parse(localStorage.getItem(TRAINING_KEY)!).seed;
    fireEvent.click(screen.getByText("Surrender"));
    fireEvent.click(await screen.findByText("Confirm surrender"));
    await screen.findByRole("dialog", { name: "Game complete" });
    fireEvent.click(screen.getByText("New game"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Game complete" })).toBeNull());
    expect(JSON.parse(localStorage.getItem(TRAINING_KEY)!).seed).not.toBe(first);
    expect(JSON.parse(localStorage.getItem(TRAINING_KEY)!).moves).toEqual([]);
  });

  it("plays no move from a key typed under the surrender dialog, and plays it again once the dialog closes", async () => {
    open();
    await screen.findByText("Surrender");
    const moves = () => JSON.parse(localStorage.getItem(TRAINING_KEY)!).moves;
    fireEvent.click(screen.getByText("Surrender"));
    await screen.findByRole("dialog", { name: "Surrender" });
    fireEvent.keyDown(window, { key: "d" });
    fireEvent.keyDown(window, { key: "c" });
    expect(moves()).toEqual([]);
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Surrender" })).toBeNull());
    fireEvent.keyDown(window, { key: "d" });
    await waitFor(() => expect(moves()).toEqual([{ k: "d" }]));
  });

  it("resumes the game in progress after a reload", async () => {
    const first = open();
    await screen.findByText("Discard tile");
    await step();
    await step();
    const before = status();
    const saved = localStorage.getItem(TRAINING_KEY);
    first.unmount();
    open();
    await screen.findByText("Discard tile");
    expect(status()).toBe(before);
    expect(localStorage.getItem(TRAINING_KEY)).toBe(saved);
  });

  it("still plays when storage throws", async () => {
    const blocked = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const blockedSet = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      open();
      await screen.findByText("Discard tile");
      await step();
      expect(status()).not.toMatch(/^0\|0\|0$/);
    } finally {
      blocked.mockRestore();
      blockedSet.mockRestore();
    }
  });
});
