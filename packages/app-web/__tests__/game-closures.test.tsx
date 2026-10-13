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
    IngameStatus: ({ score }: { score: number }) => <div>Score {score}</div>,
    GameCompleteDialog: () => null,
    ActionBar: ({ onConfirm, confirmDisabled }: { onConfirm: () => void; confirmDisabled: boolean }) => (
      <button type="button" disabled={confirmDisabled} onClick={onConfirm}>
        Confirm move
      </button>
    ),
  };
});

afterEach(cleanup);

const scored = (category: number, size: number, points: number) => ({
  name: "Scored",
  fields: { gameId: 4n, playerId: 0xabcn, category: BigInt(category), size: BigInt(size), points: BigInt(points) },
});
const built = { name: "Built", fields: { gameId: 4n, playerId: 0xabcn, tileId: 2n, plan: 7n, orientation: 1n, x: 0n, y: 0n, role: 0n, spot: 0n } };

async function confirmWith(events: unknown[]) {
  const views = new FakeGameViews();
  views.setGame(gameKey, fakeGame());
  const build = vi.fn(async () => ({ transactionHash: "0x1", events }));
  renderPage({ page: <GamePage />, path: "/game", search: "?mode=daily&id=4", views, writer: { build } });
  fireEvent.click(await screen.findByText("Slot"));
  const confirm = screen.getByText("Confirm move") as HTMLButtonElement;
  // No spot step (D-18): the move is confirm-able as soon as the tile is on a valid slot.
  await waitFor(() => expect(confirm.disabled).toBe(false));
  fireEvent.click(confirm);
  await waitFor(() => expect(build).toHaveBeenCalledTimes(1));
  return build;
}

describe("Points on closing (D-18)", () => {
  it("sends the move with no character", async () => {
    const build = await confirmWith([built]);
    expect(build.mock.calls[0][1]).toMatchObject({ role: 0, spot: 0 });
  });

  it("shows each structure the move closed, with its points", async () => {
    await confirmWith([built, scored(2, 3, 6), scored(3, 2, 8)]);
    await waitFor(() =>
      expect(screen.getByTestId("closures").textContent).toBe("Road closed: size 3, +6 pointsCity closed: size 2, +8 points"),
    );
  });

  it("shows a closure at 0 points", async () => {
    await confirmWith([built, scored(1, 4, 0)]);
    await waitFor(() => expect(screen.getByTestId("closures").textContent).toBe("Forest closed: size 4, 0 points"));
  });

  it("shows nothing for a move that closes nothing", async () => {
    await confirmWith([built]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("closures").textContent).toBe("");
  });

  it("ignores the closures of another game", async () => {
    await confirmWith([built, { ...scored(2, 3, 6), fields: { ...scored(2, 3, 6).fields, gameId: 5n } }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("closures").textContent).toBe("");
  });
});
