// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { FakeGameViews } from "@paved/chain";
import { GamePage } from "../src/pages/Game";
import { fakeGame, gameKey, notConfigured, renderPage, PLAYER } from "./helpers/page-fixtures";

vi.mock("@paved/renderer/react", () => ({ GameCanvas: () => null }));
vi.mock("@paved/ui", async () => {
  const { makeUiMock } = await import("./helpers/page-fixtures");
  return {
    ...makeUiMock(),
    IngameStatus: () => null,
    GameCompleteDialog: ({ visible }: { visible: boolean }) => (visible ? <div>Game complete</div> : null),
    SpotSelector: () => null,
    ActionBar: ({ onDiscard, discardDisabled }: { onDiscard: () => void; discardDisabled: boolean }) => (
      <button type="button" disabled={discardDisabled} onClick={onDiscard}>
        Discard tile
      </button>
    ),
  };
});

afterEach(cleanup);

const open = (opts: Parameters<typeof renderPage>[0] extends infer T ? Partial<T> : never) =>
  renderPage({ page: <GamePage />, path: "/game", search: "?mode=daily&id=4", ...opts });

function viewsWith(game = fakeGame()) {
  const views = new FakeGameViews();
  views.setGame(gameKey, game);
  return views;
}

describe("Game page states", () => {
  it("not connected: the deployment is not configured", () => {
    open({ deployment: notConfigured, account: null });
    expect(screen.getByText("Not connected")).toBeTruthy();
  });

  it("game not found", async () => {
    open({});
    await screen.findByText("Game not found: daily game 4");
  });

  it("a malformed id is a game not found too", () => {
    open({ search: "?mode=daily&id=abc" });
    expect(screen.getByText("Game not found: abc")).toBeTruthy();
  });

  it("not your game: read only, no surrender", async () => {
    open({ views: viewsWith(fakeGame("0xdef")) });
    expect((await screen.findByRole("alert")).textContent).toBe("Not your game: read only");
    expect(screen.queryByText("Surrender")).toBeNull();
    expect(screen.queryByText("Discard tile")).toBeNull();
  });

  it("pending: a write in flight disables the actions", async () => {
    let finish!: () => void;
    const discard = vi.fn(() => new Promise<{ transactionHash: string; events: [] }>((r) => (finish = () => r({ transactionHash: "0x1", events: [] }))));
    open({ views: viewsWith(), writer: { discard } });
    fireEvent.click(await screen.findByText("Discard tile"));
    await waitFor(() => expect(discard).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByText("Working...") as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByText("Discard tile") as HTMLButtonElement).disabled).toBe(true);
    finish();
  });

  it("reverted: the revert reason is shown", async () => {
    const discard = vi.fn(async () => {
      throw new Error("Game: tile not discardable");
    });
    open({ views: viewsWith(), writer: { discard } });
    fireEvent.click(await screen.findByText("Discard tile"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Game: tile not discardable"));
  });

  it("a finished game shows its completion and offers neither discard nor surrender", async () => {
    open({ views: viewsWith(fakeGame(PLAYER, true)), writer: {} });
    await screen.findByText("Game complete");
    expect((screen.getByText("Surrender") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Surrender asks first", () => {
  const setup = () => {
    const surrender = vi.fn(async () => ({ transactionHash: "0x1", events: [] }));
    open({ views: viewsWith(), writer: { surrender } });
    return surrender;
  };

  it("the first click only opens the confirm; Cancel sends nothing", async () => {
    const surrender = setup();
    fireEvent.click(await screen.findByText("Surrender"));
    expect(screen.getByRole("dialog", { name: "Surrender" })).toBeTruthy();
    expect(surrender).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(surrender).not.toHaveBeenCalled();
  });

  it("Confirm surrender sends once", async () => {
    const surrender = setup();
    fireEvent.click(await screen.findByText("Surrender"));
    fireEvent.click(screen.getByText("Confirm surrender"));
    await waitFor(() => expect(surrender).toHaveBeenCalledTimes(1));
    expect(surrender).toHaveBeenCalledWith(gameKey);
  });
});

describe("The D hotkey follows the discard button", () => {
  const pressD = () => fireEvent.keyDown(window, { key: "d" });

  it("discards with a tile in hand", async () => {
    const discard = vi.fn(async () => ({ transactionHash: "0x1", events: [] }));
    open({ views: viewsWith(), writer: { discard } });
    await screen.findByText("Discard tile");
    pressD();
    await waitFor(() => expect(discard).toHaveBeenCalledTimes(1));
  });

  it("does nothing on a finished game or an empty hand", async () => {
    const discard = vi.fn(async () => ({ transactionHash: "0x1", events: [] }));
    open({ views: viewsWith(fakeGame(PLAYER, true)), writer: { discard } });
    await screen.findByText("Game complete");
    pressD();
    await new Promise((r) => setTimeout(r, 20));
    expect(discard).not.toHaveBeenCalled();
  });
});
