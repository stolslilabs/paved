import { slow } from "../test-slow";
import { cleanup, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "../src/App";
import type { DataSources } from "../src/data";
import { MockLedger } from "../src/data/mock/ledger";
import { mockPuzzle } from "../src/data/mock/overlay";
import { queryClient } from "../src/lib/query-client";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";

// A Puzzle game's board (`/puzzle/:gameId`, the real board page) as the vehicle of the tests of the board itself (placement, slots,
// fallback, skins, settings): its engine (`PuzzleGame`) runs on the device, each move applied at once.

/**
 * The tests' Puzzle day: 2026-11-11, at noon UTC. The day picks the deck (`mockDaySeed`), the game's id and player its random, so a
 * fixed day deals a fixed first tile: on this one, the first game of the mocks' player holds a tile that fits two rotations of four
 * at each of its three slots (any day's first tile fits every rotation at every slot now and then, or one rotation only).
 */
export const PUZZLE_NOW = new Date("2026-11-11T12:00:00Z");

/**
 * A fresh ledger's first Puzzle game of `player` (the mocks' player by default), started on the tests' day, and what opens its board
 * as that player: the sources (`fakeSources` with the ledger's Puzzle, `sources` over them) and the wallet that restores the player's
 * account. It fakes `Date` at `PUZZLE_NOW` (the ledger's clock and the board's day end both read it: the game is today's on the board
 * too, whatever the real day); `resetPuzzleBoard` after each test puts the clock back.
 */
export async function puzzleBoard(options: { player?: string; sources?: Partial<DataSources> } = {}) {
  vi.useFakeTimers({ toFake: ["Date"], now: PUZZLE_NOW });
  const player = options.player ?? PLAYER_ID;
  const puzzle = mockPuzzle(new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 }));
  const game = await puzzle.start(player);
  const fakes = fakeSources({ puzzle, ...options.sources });
  return { ...fakes, puzzle, game, path: `/puzzle/${game.id}`, connector: fakeWallet({ address: player, restored: true }).load };
}

/**
 * The board of `puzzleBoard`'s game, rendered. The wallet restores the player's account after the first read: until then the game
 * shows read-only, so a test waits for what only its player sees (the lit slots, the tile in hand).
 */
export async function openPuzzleBoard(options: Parameters<typeof puzzleBoard>[0] = {}) {
  const board = await puzzleBoard(options);
  const router = createTestRouter(board.path);
  render(<App router={router} sources={board.sources} connector={board.connector} />);
  return { ...board, router };
}

/**
 * The tile in hand of the board's player (the stack's "Your tile"; another account's game shows its "Deck"): the board no longer
 * shows the game read-only, and no switch of account will open it again.
 */
export const playerHand = () => screen.findByRole("region", { name: "Your tile" }, { timeout: slow(8000) });

/**
 * After each test that opened a Puzzle board: the app unmounted and its reads stopped before the cache is cleared (the next test's
 * game has the same id on its fresh ledger, and would read the last one's record), then the real clock back.
 */
export async function resetPuzzleBoard() {
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  vi.useRealTimers();
}
