// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { FakeGameViews } from "@paved/chain";
import { GamePage } from "../src/pages/Game";
import { fakeGame, gameKey, renderPage } from "./helpers/page-fixtures";

// The canvas offers its free slots as buttons; hovering one is what makes a move confirm-able.
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: ({ availableSlots = [], onTileHover }: { availableSlots?: Array<{ x: number; y: number }>; onTileHover?: (x: number, y: number) => void }) => (
    <>
      {availableSlots.slice(0, 1).map((s) => (
        <button key={`${s.x},${s.y}`} type="button" onClick={() => onTileHover?.(s.x, s.y)}>
          Slot
        </button>
      ))}
    </>
  ),
}));
vi.mock("@paved/ui", async () => {
  const { makeUiMock } = await import("./helpers/page-fixtures");
  return {
    ...makeUiMock(),
    IngameStatus: () => null,
    GameCompleteDialog: () => null,
    ActionBar: ({ onConfirm, confirmDisabled, onDiscard }: { onConfirm: () => void; confirmDisabled: boolean; onDiscard: () => void }) => (
      <>
        <button type="button" disabled={confirmDisabled} onClick={onConfirm}>
          Confirm move
        </button>
        <button type="button" onClick={onDiscard}>
          Discard tile
        </button>
      </>
    ),
  };
});

afterEach(cleanup);

const scored = (category: number, size: number, points: number, gameId = 4n) => ({
  name: "Scored",
  fields: { gameId, playerId: 0xabcn, category: BigInt(category), size: BigInt(size), points: BigInt(points) },
});
const built = { name: "Built", fields: { gameId: 4n, playerId: 0xabcn, tileId: 2n, plan: 7n, orientation: 1n, x: 0n, y: 0n } };

async function confirmWith(events: unknown[]) {
  const views = new FakeGameViews();
  views.setGame(gameKey, fakeGame());
  const build = vi.fn(async () => ({ transactionHash: "0x1", events }));
  renderPage({ page: <GamePage />, path: "/game", search: "?mode=daily&id=4", views, writer: { build } });
  const slot = await screen.findByText("Slot");
  const confirm = screen.getByText("Confirm move") as HTMLButtonElement;
  // Nothing to confirm before a valid slot is picked.
  expect(confirm.disabled).toBe(true);
  fireEvent.click(slot);
  // No spot step (D-18): the move is confirm-able as soon as the tile is on a valid slot.
  await waitFor(() => expect(confirm.disabled).toBe(false));
  fireEvent.click(confirm);
  await waitFor(() => expect(build).toHaveBeenCalledTimes(1));
  return build;
}

describe("Confirming a move (D-18)", () => {
  it("sends the move once the tile is on a valid slot, with no spot step", async () => {
    const build = await confirmWith([built]);
    expect(build.mock.calls[0][0]).toEqual(gameKey);
    const move = build.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(move).sort()).toEqual(["orientation", "x", "y"]);
    expect(move).toEqual({ orientation: expect.any(Number), x: expect.any(Number), y: expect.any(Number) });
  });
});

describe("Points on closing (D-18)", () => {
  it("shows each structure the move closed, with its points", async () => {
    await confirmWith([built, scored(2, 3, 6), scored(1, 4, 0)]);
    await waitFor(() =>
      expect([...screen.getByTestId("closures").querySelectorAll("span")].map((l) => l.textContent)).toEqual([
        "Road closed: size 3, +6 points",
        "Forest closed: size 4, 0 points",
      ]),
    );
  });

  it("shows nothing for a move that closes nothing, nor for another game's closures", async () => {
    await confirmWith([built, scored(2, 3, 6, 5n)]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("closures").textContent).toBe("");
  });
});

describe("The closures clear with the next write (D-18)", () => {
  const receipt = (events: unknown[]) => ({ transactionHash: "0x1", events });
  const lines = () => screen.getByTestId("closures").textContent;

  /** A first move that closes a road, then the writer for what follows. */
  async function afterClosingMove(next: { build?: () => Promise<unknown>; discard?: () => Promise<unknown>; surrender?: () => Promise<unknown> }) {
    const views = new FakeGameViews();
    views.setGame(gameKey, fakeGame());
    const build = vi.fn(async () => receipt([built, scored(2, 3, 6)]));
    if (next.build) build.mockImplementationOnce(async () => receipt([built, scored(2, 3, 6)])).mockImplementation(next.build);
    const writer = { build, discard: vi.fn(next.discard ?? (async () => receipt([]))), surrender: vi.fn(next.surrender ?? (async () => receipt([]))) };
    renderPage({ page: <GamePage />, path: "/game", search: "?mode=daily&id=4", views, writer });
    fireEvent.click(await screen.findByText("Slot"));
    const confirm = () => screen.getByText("Confirm move") as HTMLButtonElement;
    await waitFor(() => expect(confirm().disabled).toBe(false));
    fireEvent.click(confirm());
    await waitFor(() => expect(lines()).toBe("Road closed: size 3, +6 points"));
    return { writer, confirm };
  }

  async function confirmAgain(confirm: () => HTMLButtonElement) {
    fireEvent.click(screen.getByText("Slot"));
    await waitFor(() => expect(confirm().disabled).toBe(false));
    fireEvent.click(confirm());
  }

  it("the next move empties them as soon as it is sent, and they stay empty when it closes nothing", async () => {
    let finish!: () => void;
    const { writer, confirm } = await afterClosingMove({ build: () => new Promise((r) => (finish = () => r(receipt([built])))) });
    await confirmAgain(confirm);
    await waitFor(() => expect(writer.build).toHaveBeenCalledTimes(2));
    expect(lines()).toBe("");
    finish();
    await new Promise((r) => setTimeout(r, 20));
    expect(lines()).toBe("");
  });

  it("a move whose write fails leaves them empty", async () => {
    const { writer, confirm } = await afterClosingMove({
      build: async () => {
        throw new Error("Game: invalid position");
      },
    });
    await confirmAgain(confirm);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Game: invalid position"));
    expect(writer.build).toHaveBeenCalledTimes(2);
    expect(lines()).toBe("");
  });

  it("a discard empties them", async () => {
    const { writer } = await afterClosingMove({});
    fireEvent.click(screen.getByText("Discard tile"));
    await waitFor(() => expect(writer.discard).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(lines()).toBe(""));
  });

  it("a surrender empties them", async () => {
    const { writer } = await afterClosingMove({});
    await waitFor(() => expect((screen.getByText("Surrender") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText("Surrender"));
    fireEvent.click(screen.getByText("Confirm surrender"));
    await waitFor(() => expect(writer.surrender).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(lines()).toBe(""));
  });
});
