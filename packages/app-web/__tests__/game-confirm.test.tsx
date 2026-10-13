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
    ActionBar: ({ onConfirm, confirmDisabled }: { onConfirm: () => void; confirmDisabled: boolean }) => (
      <button type="button" disabled={confirmDisabled} onClick={onConfirm}>
        Confirm move
      </button>
    ),
  };
});

afterEach(cleanup);

const built = { name: "Built", fields: { gameId: 4n, playerId: 0xabcn, tileId: 2n, plan: 7n, orientation: 1n, x: 0n, y: 0n } };

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

describe("Confirming a move (D-18)", () => {
  it("sends the move once the tile is on a valid slot, with no spot step", async () => {
    const build = await confirmWith([built]);
    expect(build.mock.calls[0][0]).toEqual(gameKey);
  });
});
