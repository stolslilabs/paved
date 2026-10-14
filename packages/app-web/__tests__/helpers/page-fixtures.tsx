import React from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { IndexerProvider, PavedProvider, FakeGameViews } from "@paved/chain";
import { FAKE_CHAIN_ID } from "@paved/chain/testing";
import type { Deployment, FakeGame, GameKey, IndexerClient, PavedClient } from "@paved/chain";

export const PLAYER = "0xabc";
export const configured = { configured: true, network: "devnet", tokenDecimals: 18, addresses: { Daily: "0x2", Setup: "0x3", Token: "0x4" } } as unknown as Deployment;
export const notConfigured = { configured: false, network: "devnet", tokenDecimals: 18, addresses: { Daily: "", Setup: "", Token: "" }, missing: ["RPC URL"] } as unknown as Deployment;
export const account = { address: PLAYER, execute: async () => ({ transaction_hash: "0x0" }) };

const C = 0x7fffffff;
export function fakeGame(playerId = PLAYER, over = false): FakeGame {
  return {
    game: {
      id: 4, playerId, mode: 1, seed: "0x1", score: 12, over, tileCount: 2, placedCount: 1,
      discardedCount: 0, tileId: over ? 0 : 2, plan: 7, remainingCount: 36, deckSize: 38, startTime: 1, endTime: 0, dayId: 0,
    },
    tiles: [
      { id: 1, status: 1, plan: 4, orientation: 1, x: C, y: C },
      ...(over ? [] : [{ id: 2, status: 3, plan: 7, orientation: 0, x: 0, y: 0 }]),
    ],
    builder: { gameId: 4, playerId, tileId: over ? 0 : 2, plan: over ? 0 : 7 },
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
  mint?: ReturnType<typeof vi.fn>;
  claimTutorial?: ReturnType<typeof vi.fn>;
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
  games?: unknown[];
  /** The chain id the fake RPC answers; `FAKE_CHAIN_ID` by default. */
  rpcChainId?: string;
  /** The indexer client the screens read; none by default. */
  indexer?: IndexerClient | null;
  /** Wraps the routes (an `EconomyProvider`). */
  wrap?: (routes: React.ReactElement) => React.ReactElement;
}) {
  const views = opts.views ?? new FakeGameViews();
  const playerGames = vi.fn(async () => opts.games ?? []);
  const client = {
    views,
    events: {
      playerGames,
    },
    balance: vi.fn(async () => 5n * 10n ** 18n),
    writer: () => opts.writer ?? {},
    // The RPC's chain: the fake deployments' (`FAKE_CHAIN_ID`), checked before any purchase.
    provider: { getChainId: async () => opts.rpcChainId ?? FAKE_CHAIN_ID },
  } as unknown as PavedClient;
  const utils = render(
    <PavedProvider deployment={opts.deployment ?? configured} account={opts.account === undefined ? account : opts.account} client={client}>
      <IndexerProvider client={opts.indexer ?? null}>
        <MemoryRouter initialEntries={[{ pathname: opts.path, search: opts.search ?? "", state: opts.state }]}>
          <Where />
          {(opts.wrap ?? ((r) => r))(
            <Routes>
              <Route path={opts.route ?? opts.path} element={opts.page} />
            </Routes>,
          )}
        </MemoryRouter>
      </IndexerProvider>
    </PavedProvider>,
  );
  return { ...utils, client, views, playerGames };
}

/** A store with the shape the pages read, for `vi.mock("@paved/ui")`. */
export function makeUiMock() {
  const state: Record<string, unknown> = {
    orientation: 1, strategyMode: false, x: 0, y: 0, selectedTile: null,
    setOrientation: vi.fn(), setSelectedTile: vi.fn(), setX: vi.fn(), setY: vi.fn(),
  };
  const useGameStore = Object.assign((selector: (s: typeof state) => unknown) => selector(state), { getState: () => state });
  return { useGameStore };
}
