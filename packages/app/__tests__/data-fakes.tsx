import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { FakeGameViews, IndexerClient, type PlayerGame } from "@paved/chain";
import { FakeEconomy, FakePoolQuoter, FixtureIndexer } from "@paved/chain/testing";
import type { KeyValueStore } from "@paved/game-core";
import { DataProvider, type DataSources } from "../src/data";
import { GAME_PLAYING } from "../src/mocks/games";
import { PLAYER_ID } from "../src/mocks/players";

/** A store in memory, for the Training save. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

/** The player's games as the event reader answers them: an older game over, and the mocks' game in play. */
export const EVENT_GAMES: PlayerGame[] = [
  { mode: "challenge", gameId: 1_038, startTime: GAME_PLAYING.startTime - 86_400, dayId: GAME_PLAYING.dayId - 1, over: true, score: 1_610, countedDayId: GAME_PLAYING.dayId - 1 },
  { mode: "challenge", gameId: GAME_PLAYING.id, startTime: GAME_PLAYING.startTime, dayId: GAME_PLAYING.dayId, over: false, score: null, countedDayId: null },
];

/** `@paved/chain`'s fakes, wired as the hooks' sources: the mocks' game on `FakeGameViews`, the fixture indexer. */
export function fakeSources(overrides: Partial<DataSources> = {}) {
  const views = new FakeGameViews();
  views.setGame({ mode: "challenge", gameId: GAME_PLAYING.id }, {
    game: GAME_PLAYING,
    tiles: [],
    builder: { gameId: GAME_PLAYING.id, playerId: PLAYER_ID, tileId: GAME_PLAYING.tileId, plan: GAME_PLAYING.plan },
  });
  const economy = new FakeEconomy();
  const pool = new FakePoolQuoter();
  const fixture = new FixtureIndexer();
  const indexer = new IndexerClient({ url: "http://indexer.test/", fetch: fixture.fetch as typeof fetch });
  const eventCalls: string[] = [];
  const events = {
    playerGames: async (playerId: string): Promise<PlayerGame[]> => {
      eventCalls.push(playerId);
      return EVENT_GAMES.map((g) => ({ ...g }));
    },
  };
  const store = memoryStore();
  const sources: DataSources = { views, events, economy, pool, indexer, store: () => store, ...overrides };
  return { sources, views, economy, pool, fixture, indexer, events, eventCalls, store };
}

/** Renders `hook` under a fresh query client (no retry) and the given sources. */
export function renderData<T>(hook: () => T, sources: DataSources) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <DataProvider sources={sources}>{children}</DataProvider>
    </QueryClientProvider>
  );
  return { ...renderHook(hook, { wrapper }), client };
}

/** Waits for a hook's `data` to be read, and returns it. */
export async function dataOf<T>(result: { current: { data: T | undefined } }): Promise<T> {
  await waitFor(() => expect(result.current.data).not.toBeUndefined());
  return result.current.data as T;
}
