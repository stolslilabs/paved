import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domMax } from "motion/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { Toaster } from "sonner";
import { FakeGameViews, WriteError, type EconomyViews, type GameKey, type WriteAccount } from "@paved/chain";
import { CENTER, OrientationType, replayVrfChallenge, type KeyValueStore } from "@paved/game-core";
import { MockMarkProvider } from "../../components/containers/mock-mark";
import { PHONE_320, PHONE_375, WIDE_1440 } from "../../components/scenes/viewports";
import type { DataSources, GameSigner, Purchases } from "../../data/sources";
import { mockIndexer } from "../../data/mock/indexer";
import { MockLedger } from "../../data/mock/ledger";
import { mockEconomyViews, mockEvents, mockGameViews, mockPool, mockPurchases, mockSettlements, mockSigner } from "../../data/mock/overlay";
import { SEEDED_PLAYERS } from "../../data/mock/players";
import { APP_MANIFEST } from "../../mocks/assets";
import { PLAYER_ID } from "../../mocks/players";
import HomePageRoute from "../../routes/pages/home";
import MissionsPageRoute from "../../routes/pages/missions";
import OverPageRoute from "../../routes/pages/over";
import VillagePageRoute from "../../routes/pages/village";
import { PAGES } from "../../routes/pages";
import { ProfileHost } from "../../routes/profile-host";
import { WalletProvider, useAccount, type LoadConnector } from "../../wallet/wallet";

/**
 * The indexer's pages on the mock (#927, PR 5): no indexer at all, every route answered from the device's ledger
 * (`data/mock/indexer.ts`). The missions count the games played on the ledger as the Challenge reports them; the game-over
 * page's best is read from the player's games; the profile's figures are the ledger's; and a seeded player (`players.ts`, one of
 * twenty, named by #926's generator) has a village to visit. Each story plays its games on the ledger in its loader (each tile
 * where it scores most, on the device's clock), then mounts the route.
 */
const meta = { title: "Pages/Mock indexer", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** The pages' tile art reads `renderer-assets/manifest.json`, which Storybook does not serve: the same manifest, in memory. */
const served = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) =>
  String(input instanceof Request ? input.url : input).endsWith("renderer-assets/manifest.json")
    ? Promise.resolve(new Response(JSON.stringify(APP_MANIFEST), { headers: { "content-type": "application/json" } }))
    : served(input, init);

const ORIENTATIONS = Object.values(OrientationType);

/** What the ledger holds before the story: `new`, nothing; `played`, a game surrendered after four moves, then one played to its end. */
type Seed = "new" | "played";

function memory(): KeyValueStore {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

/** Plays `moves` moves of the game, each tile where it scores most (else a discard), or to its end. */
async function play(ledger: MockLedger, key: GameKey, moves = Infinity) {
  const writes = ledger.writesFor(PLAYER_ID);
  for (let i = 0; i < moves && !(await ledger.game(key)).over; i++) {
    const [game, tiles, draw, seed] = await Promise.all([ledger.game(key), ledger.tiles(key), ledger.draw(key), ledger.initialSeed(key)]);
    const engine = replayVrfChallenge(BigInt(seed), tiles, game, draw);
    let best: { slot: ReturnType<typeof engine.legalPlacements>[number]; score: number } | null = null;
    for (const slot of engine.legalPlacements(engine.hand!.plan)) {
      const score = engine.clone().build(slot).score;
      if (!best || score > best.score) best = { slot, score };
    }
    if (best) await writes.build(key, { orientation: ORIENTATIONS.indexOf(best.slot.orientation), x: CENTER + best.slot.x, y: CENTER + best.slot.y });
    else await writes.discard(key);
  }
}

/** The ledger's store with the story's games, bought and played by the ledger an hour and a half-hour ago. */
async function seeded(seed: Seed): Promise<KeyValueStore> {
  const store = memory();
  if (seed === "new") return store;
  const now = Math.floor(Date.now() / 1000);
  const clock = { now: now - 3_600 };
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.now });
  const writes = ledger.writesFor(PLAYER_ID);
  const buy = async () => {
    const quote = await ledger.quote(1);
    return { mode: "challenge" as const, gameId: (await writes.purchase({ stake: 1, confirmedPrice: quote.price, confirmedMinOut: 1n, referrer: null })).gameId };
  };
  const first = await buy();
  await play(ledger, first, 4);
  await writes.surrender(first);
  clock.now = now - 1_800;
  await play(ledger, await buy());
  return store;
}

/** The app's sources on the ledger alone, its indexer the ledger's, and a connected player whose writes are the ledger's. */
function environment(store: KeyValueStore) {
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 600 });
  const noChain: Purchases = { purchase: () => Promise.reject(new WriteError("no chain")), buyPack: () => Promise.reject(new WriteError("no chain")), referrer: async () => null, receipt: async () => "unknown" };
  const sources: DataSources = {
    views: mockGameViews(new FakeGameViews(), ledger),
    events: mockEvents({ playerGames: async () => [] }, ledger),
    economy: mockEconomyViews({} as EconomyViews, ledger),
    pool: mockPool(ledger),
    indexer: mockIndexer(ledger),
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

/** The page of `path` in the app's route map: its route's `handle`, which the pages read. */
const handle = (path: string) => ({ page: PAGES.find((p) => p.path === path)! });

/** The pages on their routes, in a data router of their own at `route`, the profile the app's (`ProfileHost`). */
function IndexerPages({ store, route }: { store: KeyValueStore; route: string }) {
  const [env] = useState(() => environment(store));
  const [router] = useState(() =>
    createMemoryRouter(
      [
        { path: "/", element: <HomePageRoute />, handle: handle("") },
        { path: "/missions", element: <MissionsPageRoute />, handle: handle("missions") },
        { path: "/game/:gameId/over", element: <OverPageRoute />, handle: handle("game/:gameId/over") },
        { path: "/village/:player", element: <VillagePageRoute />, handle: handle("village/:player") },
      ],
      { initialEntries: [route] },
    ),
  );
  return (
    <QueryClientProvider client={env.client}>
      <WalletProvider sources={env.sources} load={env.load}>
        <MockMarkProvider value>
          <LazyMotion features={domMax}>
            <ProfileHost>
              <Restore />
              <RouterProvider router={router} />
            </ProfileHost>
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
    render: (_args, { loaded, parameters }) => <IndexerPages store={loaded.store as KeyValueStore} route={parameters.route!} />,
  };
}

/** A story pinned to a viewport, its route kept (the viewport's `parameters` would replace the story's). */
function at(base: Story, viewport: { parameters?: Story["parameters"]; globals: Story["globals"] }): Story {
  return { ...base, parameters: { ...base.parameters, ...viewport.parameters }, globals: viewport.globals };
}

/** A seeded player of the mock, at level 15: its name and village. */
const SEEDED = SEEDED_PLAYERS.find((p) => p.level === 15)!;

/**
 * The missions after two games today on the mock: Daily Run and the day's rotating dailies its played-out game reached, the
 * fifth daily (finish 2 games) done, the weeklies counting both, Settler I to claim; the day's bar at its dailies done.
 */
export const Missions: Story = story("played", "/missions");
export const MissionsPhone320: Story = at(Missions, PHONE_320);
export const MissionsPhone375: Story = at(Missions, PHONE_375);
export const MissionsWide1440: Story = at(Missions, WIDE_1440);

/** A new account's missions on the mock: every daily and weekly at 0, every achievement locked. */
export const MissionsNew: Story = story("new", "/missions");
export const MissionsNewPhone320: Story = at(MissionsNew, PHONE_320);
export const MissionsNewWide1440: Story = at(MissionsNew, WIDE_1440);

/** The game-over page of the game played out: "New best", the player's best before it read from the ledger's games. */
export const OverNewBest: Story = story("played", "/game/2/over");
export const OverNewBestPhone320: Story = at(OverNewBest, PHONE_320);
export const OverNewBestPhone375: Story = at(OverNewBest, PHONE_375);
export const OverNewBestWide1440: Story = at(OverNewBest, WIDE_1440);

/** A seeded player's page: its village, read-only, under the name #926's generator gave it. */
export const SeededPlayer: Story = story("new", `/village/${SEEDED.address}`);
export const SeededPlayerPhone320: Story = at(SeededPlayer, PHONE_320);
export const SeededPlayerPhone375: Story = at(SeededPlayer, PHONE_375);
export const SeededPlayerWide1440: Story = at(SeededPlayer, WIDE_1440);

/** The profile of the player of the two games, from the home's badge: its games, finished games and best, the ledger's. */
export const Profile: Story = {
  ...story("played", "/"),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /^Profile: / }, { timeout: 10_000 }));
  },
};
export const ProfilePhone320: Story = at(Profile, PHONE_320);
export const ProfileWide1440: Story = at(Profile, WIDE_1440);
