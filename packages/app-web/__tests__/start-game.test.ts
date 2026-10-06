import { describe, expect, it, vi } from "vitest";
import type { PlayerGame } from "@paved/chain";
import { readStartIntent, startGame, startIntent, type StartDeps } from "../src/utils/start-game";

const game = (over: boolean, gameId = 1): PlayerGame => ({
  mode: "daily",
  gameId,
  startTime: 1,
  tournamentId: 0,
  over,
  score: over ? 5 : null,
  countedTournamentId: over ? 0 : null,
});

function deps(overrides: Partial<StartDeps> = {}) {
  const calls: string[] = [];
  const d: StartDeps = {
    listGames: vi.fn(async () => []),
    spawn: vi.fn(async () => ({ gameId: 7 })),
    clearIntent: vi.fn(() => calls.push("clear")),
    open: vi.fn((id: number) => calls.push(`open ${id}`)),
    ...overrides,
  };
  return { d, calls };
}

describe("startIntent / readStartIntent (the consent is the history state)", () => {
  it("the landing page's confirm builds a state the game page reads", () => {
    expect(readStartIntent(startIntent("daily", 10n ** 18n), "daily")).toEqual({ confirmedAmount: 10n ** 18n });
    expect(readStartIntent(startIntent("daily", 0n), "daily")).toEqual({ confirmedAmount: 0n });
    expect(readStartIntent(startIntent("tutorial", null), "tutorial")).toEqual({ confirmedAmount: undefined });
  });

  it("no state (a link, a reload after the clear, Back) is no consent", () => {
    for (const state of [null, undefined, {}, "start", { start: false }, { start: 1 }]) {
      expect(readStartIntent(state, "daily")).toBeNull();
      expect(readStartIntent(state, "tutorial")).toBeNull();
    }
  });

  it("a Daily consent needs the confirmed amount, as a plain integer", () => {
    expect(readStartIntent({ start: true }, "daily")).toBeNull();
    for (const bad of ["-1", "1.5", "0x10", "01", "", 5, 5n, null]) {
      expect(readStartIntent({ start: true, confirmedAmount: bad }, "daily")).toBeNull();
    }
  });
});

describe("startGame", () => {
  it("a URL carrying spawn=1&price=X and no state spawns nothing", async () => {
    // The page reads the URL for the game to show, and the state for the consent: a crafted link has none.
    const intent = readStartIntent(null, "daily");
    const { d } = deps();
    expect(await startGame(intent, d)).toBe("none");
    expect(d.spawn).not.toHaveBeenCalled();
    expect(d.clearIntent).not.toHaveBeenCalled();
  });

  it("the normal confirm path spawns once, with the confirmed amount, and opens the game", async () => {
    const { d, calls } = deps();
    const intent = readStartIntent(startIntent("daily", 10n ** 18n), "daily");
    expect(await startGame(intent, d)).toBe("spawned");
    expect(d.spawn).toHaveBeenCalledTimes(1);
    expect(d.spawn).toHaveBeenCalledWith(10n ** 18n);
    expect(calls).toEqual(["clear", "open 7"]);
  });

  it("the consent is cleared before anything is sent", async () => {
    const order: string[] = [];
    const { d } = deps({
      listGames: vi.fn(async () => { order.push("list"); return []; }),
      spawn: vi.fn(async () => { order.push("spawn"); return { gameId: 7 }; }),
      clearIntent: vi.fn(() => order.push("clear")),
    });
    await startGame(readStartIntent(startIntent("daily", 1n), "daily"), d);
    expect(order).toEqual(["clear", "list", "spawn"]);
  });

  it("a reload after a refused spawn spawns nothing: the state was cleared, so no consent is left", async () => {
    let state: unknown = startIntent("daily", 10n ** 18n);
    const spawn = vi.fn(async () => { throw new Error("The entry price changed: confirm again"); });
    const clearIntent = vi.fn(() => { state = null; }); // navigate(..., { replace: true, state: null })
    const first = deps({ spawn, clearIntent });
    await expect(startGame(readStartIntent(state, "daily"), first.d)).rejects.toThrow(/entry price changed/);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(state).toBeNull();

    // Reload (or Back): the page reads the history state again.
    const reload = deps({ spawn });
    expect(await startGame(readStartIntent(state, "daily"), reload.d)).toBe("none");
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("resumes the active game instead of spawning, still clearing the consent", async () => {
    const { d, calls } = deps({ listGames: vi.fn(async () => [game(true, 2), game(false, 5)]) });
    expect(await startGame(readStartIntent(startIntent("daily", 1n), "daily"), d)).toBe("resumed");
    expect(d.spawn).not.toHaveBeenCalled();
    expect(calls).toEqual(["clear", "open 5"]);
  });
});
