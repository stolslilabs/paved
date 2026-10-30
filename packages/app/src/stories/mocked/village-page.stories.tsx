import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domMax } from "motion/react";
import { Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { FakeGameViews, IndexerClient, SKIN_PLANS, type WriteAccount } from "@paved/chain";
import { inventoryOf, starterLayout, xpFloor, type ChestRank } from "@paved/game-core";
import { MockMarkProvider } from "../../components/containers/mock-mark";
import type { DataSources, GameSigner } from "../../data/sources";
import { MOCK_KEY, MOCK_STARTING_PAVED, MockLedger } from "../../data/mock/ledger";
import { mockGameViews, mockSigner } from "../../data/mock/overlay";
import { freshV2, mockRivalsV2 } from "../../data/mock/v2";
import { APP_MANIFEST } from "../../mocks/assets";
import { PLAYER_ID } from "../../mocks/players";
import { PLAN } from "../../mocks/village";
import HomePageRoute from "../../routes/pages/home";
import VillagePageRoute from "../../routes/pages/village";
import ChestsPageRoute from "../../routes/pages/village-chests";
import ShopPageRoute from "../../routes/pages/village-shop";
import { WalletProvider, type LoadConnector } from "../../wallet/wallet";

/**
 * The v2 village's pages (#739; the own village is the home since #753) as the app wires them, on the mock data source (Sepolia's, MOCK-FIRST, #741): the pages' own
 * hooks read the mock ledger (`data/mock/ledger.ts`) through its overlay, and their writes go to the ledger, so Found, Save, a
 * chest's opening and claim and a purchase all complete here. Each story seeds the ledger's state, then mounts the route. The
 * player is connected (a stand-in for the controller); the visit reads one of the mock's rival villages.
 */
const meta = { title: "Pages/Village", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** A rival of PvP v2 at level 16: a visit. */
const RIVAL = mockRivalsV2().find((r) => r.level >= 16)!.address;

/**
 * The pages' tile art reads `renderer-assets/manifest.json` (`manifestBody`), which Storybook does not serve (the preview hands
 * the renderer `APP_MANIFEST` in memory): this page's read gets the same manifest, so its tiles show their renders in the
 * owner's skins. Every other request goes through as it was.
 */
const served = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) =>
  String(input instanceof Request ? input.url : input).endsWith("renderer-assets/manifest.json")
    ? Promise.resolve(new Response(JSON.stringify(APP_MANIFEST), { headers: { "content-type": "application/json" } }))
    : served(input, init);

const P = PLAN;
/** The tiles chests and the shop gave besides the starter layout: they wait in the inventory. */
const EXTRAS = [P.road, P.road, P.roadCross, P.roadBend, P.cityEdge, P.cityEdge, P.wonder, P.forestCity, P.stopRoads];

interface Seed {
  founded: boolean;
  level: number;
  cobbles: number;
  chests: ChestRank[];
}

/** The player's stored state in the ledger's format: the starter layout founded (or not), extras in the inventory, chests waiting. */
function player({ founded, level, cobbles, chests }: Seed) {
  const layout = starterLayout(BigInt(PLAYER_ID));
  const today = Math.floor(Date.now() / 86_400_000);
  return {
    cobbles,
    credits: 0,
    achievementsClaimed: "0",
    days: {},
    weeks: {},
    // Every Forest skin owned and active: the board draws the tiles in it.
    owned: { 1: 0xffffe },
    active: new Array<number>(SKIN_PLANS).fill(1),
    shares: "0",
    paved: MOCK_STARTING_PAVED.toString(),
    usdc: "0",
    v2: {
      ...freshV2(),
      xp: xpFloor(level),
      inventory: founded ? inventoryOf([...layout.map((t) => t.plan), ...EXTRAS]) : freshV2().inventory,
      layout: founded ? layout : null,
      // The first two won today in PvP (they fill two of the day's slots, #784), the third in Story (no slot).
      chests: { pending: chests.map((rank, i) => ({ rank, league: 2, origin: i < 2 ? { source: "pvp" as const, day: today, slot: i } : { source: "story" as const } })), open: null, opened: 0 },
      pvpChests: { [today]: Math.min(2, chests.length) },
    },
  };
}

function seeded(seed: Seed) {
  const players = { [`0x${BigInt(PLAYER_ID).toString(16)}`]: player(seed) };
  const data = new Map([[MOCK_KEY, JSON.stringify({ version: 1, players, vault: { assets: "0", supply: "0" }, transactions: 0 })]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

/** The app's sources on the mock ledger, and a connector whose account is the stories' player, its writes the ledger's. */
function environment(seed: Seed) {
  const store = seeded(seed);
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 600 });
  const views = mockGameViews(new FakeGameViews(), ledger);
  const indexer = new IndexerClient({ url: "http://indexer.invalid/", fetch: (() => Promise.reject(new Error("No indexer in this story"))) as typeof fetch });
  const sources: DataSources = { views, events: { playerGames: async () => [] }, economy: null, pool: null, indexer, signer: null };
  const account: WriteAccount = { address: PLAYER_ID, execute: async () => ({ transaction_hash: "0x0" }) };
  const load: LoadConnector = async () => ({
    probe: async () => account,
    connect: async () => account,
    disconnect: async () => undefined,
    reset: async () => account,
    username: async () => "bal7hazar",
    signer: (from) => mockSigner({ address: from.address } as unknown as GameSigner, ledger),
  });
  return { sources, load, client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
}

const SEED: Seed = { founded: true, level: 6, cobbles: 85, chests: ["epic", "rare", "basic"] };

/** The pages on their routes, in the stories' router (the preview's, at `parameters.route`). */
function VillagePages({ seed = SEED }: { seed?: Seed }) {
  const [env] = useState(() => environment(seed));
  return (
    <QueryClientProvider client={env.client}>
      <WalletProvider sources={env.sources} load={env.load}>
        <MockMarkProvider value>
          <LazyMotion features={domMax}>
            <Routes>
              <Route path="/" element={<HomePageRoute />} />
              <Route path="/village/chests" element={<ChestsPageRoute />} />
              <Route path="/village/shop" element={<ShopPageRoute />} />
              <Route path="/village/:player?" element={<VillagePageRoute />} />
            </Routes>
            <Toaster />
          </LazyMotion>
        </MockMarkProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}

/** The player's village, the home (#753): the starter layout at level 6 (14 slots), 9 tiles waiting in the inventory, 3 chests. Edit opens the editor. */
export const Board: Story = { parameters: { route: "/" }, render: () => <VillagePages /> };
/** A new player: the starter alone, and Found. */
export const Fresh: Story = { parameters: { route: "/" }, render: () => <VillagePages seed={{ founded: false, level: 1, cobbles: 0, chests: [] }} /> };
/** The chests waiting, oldest first: an epic (1 of 3) and a rare (1 of 2) won today, a Story basic (one tile): the modal opens on arrival. */
export const Chests: Story = { parameters: { route: "/village/chests", sfx: 0.8 }, render: () => <VillagePages /> };
/** The day's shop: 3 base plans, each bought once a day. */
export const Shop: Story = { parameters: { route: "/village/shop" }, render: () => <VillagePages seed={{ ...SEED, cobbles: 120 }} /> };
/** A rival's village: read-only, their score and level. */
export const Visit: Story = { parameters: { route: `/village/${RIVAL}` }, render: () => <VillagePages /> };
