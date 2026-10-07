import React from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { IndexerProvider, PavedProvider, FakeGameViews } from "@paved/chain";
import type { Deployment, FakeGame, GameKey, IndexerClient, PavedClient } from "@paved/chain";

export const PLAYER = "0xabc";
export const configured = { configured: true, network: "devnet", tokenDecimals: 18, addresses: { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" } } as unknown as Deployment;
export const notConfigured = { configured: false, network: "devnet", tokenDecimals: 18, addresses: { Account: "", Daily: "", Tutorial: "", Token: "" }, missing: ["RPC URL"] } as unknown as Deployment;
export const account = { address: PLAYER, execute: async () => ({ transaction_hash: "0x0" }) };

const C = 0x7fffffff;
export function fakeGame(playerId = PLAYER, over = false): FakeGame {
  return {
    game: {
      id: 4, playerId, mode: 1, seed: "0x1", score: 12, over, tileCount: 2, placedCount: 1,
      discardedCount: 0, tileId: over ? 0 : 2, plan: 7, remainingCount: 36, deckSize: 38, startTime: 1, endTime: 0, tournamentId: 0,
    },
    tiles: [
      { id: 1, status: 1, plan: 4, orientation: 1, x: C, y: C },
      ...(over ? [] : [{ id: 2, status: 3, plan: 7, orientation: 0, x: 0, y: 0 }]),
    ],
    builder: { gameId: 4, playerId, tileId: over ? 0 : 2, plan: over ? 0 : 7, placedCount: 0, availableCount: 7 },
    characters: [1, 2, 3, 4, 5, 6, 7].map((role) => ({ role, placed: false, tileId: 0, x: 0, y: 0, spot: 0 })),
  };
}

export const gameKey: GameKey = { mode: "daily", gameId: 4 };

export function Where() {
  const l = useLocation();
  return <output data-testid="where">{`${l.pathname}${l.search}|${JSON.stringify(l.state)}`}</output>;
}

export interface FakeWriter {
  spawn?: ReturnType<typeof vi.fn>;
  discard?: ReturnType<typeof vi.fn>;
  surrender?: ReturnType<typeof vi.fn>;
  build?: ReturnType<typeof vi.fn>;
  createPlayer?: ReturnType<typeof vi.fn>;
  claim?: ReturnType<typeof vi.fn>;
  sponsor?: ReturnType<typeof vi.fn>;
  mint?: ReturnType<typeof vi.fn>;
}

export function renderPage(opts: {
  page: React.ReactElement;
  path: string;
  /** The route pattern when it differs from the path (`/player/:playerId`). */
  route?: string;
  search?: string;
  state?: unknown;
  deployment?: Deployment;
  account?: typeof account | null;
  views?: FakeGameViews;
  writer?: FakeWriter;
  player?: { id: string; name: string; master: string } | null;
  games?: unknown[];
  /** The indexer client the screens read; none by default. */
  indexer?: IndexerClient | null;
}) {
  const views = opts.views ?? new FakeGameViews();
  const playerGames = vi.fn(async () => opts.games ?? []);
  const client = {
    views,
    events: { playerGames },
    player: vi.fn(async () => (opts.player === undefined ? { id: PLAYER, name: "Zed", master: PLAYER } : opts.player)),
    balance: vi.fn(async () => 5n * 10n ** 18n),
    writer: () => opts.writer ?? {},
  } as unknown as PavedClient;
  const utils = render(
    <PavedProvider deployment={opts.deployment ?? configured} account={opts.account === undefined ? account : opts.account} client={client}>
      <IndexerProvider client={opts.indexer ?? null}>
        <MemoryRouter initialEntries={[{ pathname: opts.path, search: opts.search ?? "", state: opts.state }]}>
          <Where />
          <Routes>
            <Route path={opts.route ?? opts.path} element={opts.page} />
          </Routes>
        </MemoryRouter>
      </IndexerProvider>
    </PavedProvider>,
  );
  return { ...utils, client, views, playerGames };
}

/** A store with the shape the pages read, for `vi.mock("@paved/ui")`. */
export function makeUiMock() {
  const state: Record<string, unknown> = {
    orientation: 1, strategyMode: false, character: 0, spot: 0, x: 0, y: 0, selectedTile: null,
    setOrientation: vi.fn(), setSelectedTile: vi.fn(), setCharacter: vi.fn(), setSpot: vi.fn(), setX: vi.fn(), setY: vi.fn(),
  };
  const useGameStore = Object.assign((selector: (s: typeof state) => unknown) => selector(state), { getState: () => state });
  return { useGameStore };
}
