import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domMax } from "motion/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { Toaster } from "sonner";
import { FakeGameViews, IndexerClient, WriteError, settlesAfter, type EconomyViews, type GameKey, type WriteAccount } from "@paved/chain";
import { CENTER, OrientationType, replayVrfChallenge, type KeyValueStore } from "@paved/game-core";
import { MockMarkProvider } from "../../components/containers/mock-mark";
import { PHONE_320, PHONE_375, WIDE_1440 } from "../../components/scenes/viewports";
import type { DataSources, GameSigner, Purchases } from "../../data/sources";
import { MOCK_KEY, MockLedger } from "../../data/mock/ledger";
import { mockEconomyViews, mockEvents, mockGameViews, mockPool, mockPurchases, mockSettlements, mockSigner } from "../../data/mock/overlay";
import { APP_MANIFEST } from "../../mocks/assets";
import { PLAYER_ID } from "../../mocks/players";
import BoardPageRoute from "../../routes/pages/board";
import OverPageRoute from "../../routes/pages/over";
import PurchasePageRoute from "../../routes/pages/purchase";
import { PAGES } from "../../routes/pages";
import { WalletProvider, useAccount, type LoadConnector } from "../../wallet/wallet";

/**
 * The Challenge's games on the mock (#927, PR 4): the purchase page, the board and the game-over page as the app wires them, on
 * the device's ledger alone. A game is bought with the ledger's USDC, played on the board by game-core's rules (the VRF's queue,
 * each draw from the seed kept with the game), recorded at its end and settled from the end of the next day, its reward minted
 * in the ledger's PAVED. Each story seeds the ledger's games (bought and played by the ledger itself, at the times it says),
 * then mounts the route. No chain, no indexer: the pages' clock is the device's.
 */
const meta = { title: "Pages/Mock games", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** The board's tile art reads `renderer-assets/manifest.json`, which Storybook does not serve: the same manifest, in memory. */
const served = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) =>
  String(input instanceof Request ? input.url : input).endsWith("renderer-assets/manifest.json")
    ? Promise.resolve(new Response(JSON.stringify(APP_MANIFEST), { headers: { "content-type": "application/json" } }))
    : served(input, init);

const DAY = 86_400;
const ORIENTATIONS = Object.values(OrientationType);

/**
 * What the ledger holds before the story: `new`, nothing (a new account's 100 USDC); `playing`, a stake-1 game bought ten minutes
 * ago and eight moves in; `over`, a game played to its end today, its reward to wait for; `ready`, one played two days ago, its
 * day closable; `below`, one of two days ago surrendered after six moves and settled under the threshold; `rewarded`, one of two
 * days ago played to its end and settled over the threshold (its day's prior set at 100 points, so whatever its score).
 */
type Seed = "new" | "playing" | "over" | "ready" | "below" | "rewarded";

function memory(): KeyValueStore {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

/** Plays `moves` moves of the game (each the first legal slot of the tile in hand, else a discard), or to its end. */
async function play(ledger: MockLedger, key: GameKey, moves = Infinity) {
  const writes = ledger.writesFor(PLAYER_ID);
  for (let i = 0; i < moves && !(await ledger.game(key)).over; i++) {
    const [game, tiles, draw, seed] = await Promise.all([ledger.game(key), ledger.tiles(key), ledger.draw(key), ledger.initialSeed(key)]);
    const engine = replayVrfChallenge(BigInt(seed), tiles, game, draw);
    const [slot] = engine.legalPlacements(engine.hand!.plan);
    if (slot) await writes.build(key, { orientation: ORIENTATIONS.indexOf(slot.orientation), x: CENTER + slot.x, y: CENTER + slot.y });
    else await writes.discard(key);
  }
}

/** The ledger's store with the story's game in it, bought and played by the ledger at its own clock. */
async function seeded(seed: Seed): Promise<KeyValueStore> {
  const store = memory();
  const now = Math.floor(Date.now() / 1000);
  const clock = { now };
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.now });
  if (seed === "new") return store;
  const past = seed === "ready" || seed === "below" || seed === "rewarded";
  clock.now = past ? (Math.floor(now / DAY) - 2) * DAY + 3_600 : now - 600;
  const quote = await ledger.quote(1);
  const { gameId } = await ledger.writesFor(PLAYER_ID).purchase({ stake: 1, confirmedPrice: quote.price, confirmedMinOut: 1n, referrer: null });
  const key: GameKey = { mode: "challenge", gameId };
  await play(ledger, key, seed === "playing" ? 8 : seed === "below" ? 6 : Infinity);
  if (seed === "below") await ledger.writesFor(PLAYER_ID).surrender(key);
  if (seed === "rewarded") {
    const state = JSON.parse(store.getItem(MOCK_KEY)!);
    state.challenge.days[String(Math.floor(clock.now / DAY))].prior = 100_000;
    store.setItem(MOCK_KEY, JSON.stringify(state));
  }
  if (seed === "below" || seed === "rewarded") {
    clock.now = settlesAfter(Math.floor(clock.now / DAY));
    await ledger.writesFor(PLAYER_ID).settle([gameId]);
  }
  return store;
}

/** The app's sources on the ledger alone, and a connected player whose writes are the ledger's. */
function environment(store: KeyValueStore) {
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 600 });
  const indexer = new IndexerClient({ url: "http://indexer.invalid/", fetch: (() => Promise.reject(new Error("No indexer in this story"))) as typeof fetch });
  const noChain: Purchases = { purchase: () => Promise.reject(new WriteError("no chain")), buyPack: () => Promise.reject(new WriteError("no chain")), referrer: async () => null, receipt: async () => "unknown" };
  const sources: DataSources = {
    views: mockGameViews(new FakeGameViews(), ledger),
    events: mockEvents({ playerGames: async () => [] }, ledger),
    economy: mockEconomyViews({} as EconomyViews, ledger),
    pool: mockPool(ledger),
    indexer,
    signer: null,
    purchases: (signer) => mockPurchases(noChain, ledger, signer.address),
    settlements: (signer) => mockSettlements(ledger, signer.address),
  };
  const account: WriteAccount = { address: PLAYER_ID, execute: async () => ({ transaction_hash: "0x0" }) };
  const load: LoadConnector = async () => ({
    probe: async () => account,
    connect: async () => account,
    disconnect: async () => undefined,
    reset: async () => account,
    username: async () => "bal7hazar",
    signer: (from: WriteAccount) => mockSigner({ address: from.address } as unknown as GameSigner, ledger),
  });
  return { sources, load, client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
}

/** Looks for the wallet's session as the app's shell does (`useAccount`): the stories' player is connected. */
function Restore() {
  useAccount();
  return null;
}

/** The page of `path` in the app's route map: its route's `handle`, which the board and the over page read. */
const handle = (path: string) => ({ page: PAGES.find((p) => p.path === path)! });

/** The three pages on their routes, in a data router of their own at `route` (they read their route's `handle`). */
function GamePages({ store, route }: { store: KeyValueStore; route: string }) {
  const [env] = useState(() => environment(store));
  const [router] = useState(() =>
    createMemoryRouter(
      [
        { path: "/play/challenge", element: <PurchasePageRoute />, handle: handle("play/challenge") },
        { path: "/game/:gameId", element: <BoardPageRoute />, handle: handle("game/:gameId") },
        { path: "/game/:gameId/over", element: <OverPageRoute />, handle: handle("game/:gameId/over") },
      ],
      { initialEntries: [route] },
    ),
  );
  return (
    <QueryClientProvider client={env.client}>
      <WalletProvider sources={env.sources} load={env.load}>
        <MockMarkProvider value>
          <LazyMotion features={domMax}>
            <Restore />
            <RouterProvider router={router} />
            <Toaster />
          </LazyMotion>
        </MockMarkProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}

/** A story of `seed` at `route`: the ledger seeded in its loader, then the pages mounted on it. */
function story(seed: Seed, route: string): Story {
  return {
    parameters: { route, ownRouter: true },
    loaders: [async () => ({ store: await seeded(seed) })],
    render: (_args, { loaded, parameters }) => <GamePages store={loaded.store as KeyValueStore} route={parameters.route!} />,
  };
}

/** A story pinned to a viewport, its route kept (the viewport's `parameters` would replace the story's). */
function at(base: Story, viewport: { parameters?: Story["parameters"]; globals: Story["globals"] }): Story {
  return { ...base, parameters: { ...base.parameters, ...viewport.parameters }, globals: viewport.globals };
}

/** A new account's Challenge on the mock: the faucet's 100 USDC, the ledger's quote (2 USDC a stake, today's threshold 3,980 points). */
export const Purchase: Story = story("new", "/play/challenge");
export const PurchasePhone320: Story = at(Purchase, PHONE_320);
export const PurchasePhone375: Story = at(Purchase, PHONE_375);
export const PurchaseWide1440: Story = at(Purchase, WIDE_1440);

/** A game bought on the mock, eight moves in: the tile in hand and the two after it, drawn from the game's seed. */
export const Playing: Story = story("playing", "/game/1");
export const PlayingPhone320: Story = at(Playing, PHONE_320);
export const PlayingPhone375: Story = at(Playing, PHONE_375);
export const PlayingWide1440: Story = at(Playing, WIDE_1440);

/** A game played to its end today: recorded, its reward waiting for the day to close (from the end of the next day). */
export const OverPending: Story = story("over", "/game/1/over");
export const OverPendingPhone320: Story = at(OverPending, PHONE_320);
export const OverPendingWide1440: Story = at(OverPending, WIDE_1440);

/** A game of two days ago: its day may close, and Settle and claim sends the ledger's settlement. */
export const OverReady: Story = story("ready", "/game/1/over");
export const OverReadyPhone320: Story = at(OverReady, PHONE_320);
export const OverReadyWide1440: Story = at(OverReady, WIDE_1440);

/** Surrendered early and settled under the day's threshold: no reward, the stake lost. */
export const OverBelow: Story = story("below", "/game/1/over");
export const OverBelowPhone320: Story = at(OverBelow, PHONE_320);

/** Settled over the threshold of a day whose prior was 100 points: the PAVED the ledger minted. */
export const OverRewarded: Story = story("rewarded", "/game/1/over");
export const OverRewardedPhone320: Story = at(OverRewarded, PHONE_320);
export const OverRewardedWide1440: Story = at(OverRewarded, WIDE_1440);
