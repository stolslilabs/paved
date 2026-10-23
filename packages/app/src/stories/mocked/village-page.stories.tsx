import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domMax } from "motion/react";
import { Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { FakeGameViews, IndexerClient, type WriteAccount } from "@paved/chain";
import { SKIN_PLANS } from "@paved/chain";
import { legalCells, type Cell } from "../../components/containers/village-rules";
import { MockMarkProvider } from "../../components/containers/mock-mark";
import type { DataSources, GameSigner } from "../../data/sources";
import { MOCK_KEY, MOCK_STARTING_PAVED, MockLedger } from "../../data/mock/ledger";
import { mockGameViews, mockSigner } from "../../data/mock/overlay";
import { STARTER } from "../../data/village";
import { PLAYER_ID } from "../../mocks/players";
import { PLAN, grow, square } from "../../mocks/village";
import Page from "../../routes/pages/village";
import { WalletProvider, type LoadConnector } from "../../wallet/wallet";

/**
 * The village page (#646 PR 2) as the app wires it, on the mock data source (Sepolia's, until `Village` and `Rewards` are
 * deployed): the page's own hooks read the mock ledger (`data/mock/ledger.ts`) through its overlay, and its writes go to the
 * ledger, so Found, Open, a placement, a copy, the Cobbles and a parcel all complete here. Each story seeds the ledger's
 * state, then mounts the route. The player is connected (a stand-in for the controller); the visit reads another address.
 */
const meta = { title: "Pages/Village", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const RIVAL = "0x7a11ce";

/** A village grown by the rules from the starter: each plan on its first legal cell, nearest the centre. */
function grown(cells: readonly Cell[], plans: readonly number[]) {
  const tiles: { id: number; plan: number; orientation: number; x: number; y: number }[] = [{ ...STARTER }];
  for (const plan of plans) {
    const spot = legalCells({ cells, tiles }, plan).sort((a, b) => Math.abs(a.x) + Math.abs(a.y) - (Math.abs(b.x) + Math.abs(b.y)))[0];
    if (spot) tiles.push({ id: tiles.length + 1, plan, orientation: spot.orientations[0]!, x: spot.x, y: spot.y });
  }
  return tiles.slice(1).map(({ plan, orientation, x, y }) => ({ plan, orientation, x, y }));
}

const P = PLAN;
const MIXED = [P.road, P.roadCross, P.roadBend, P.cityEdge, P.wonder, P.forestCity, P.road, P.stopRoads, P.roadCity, P.cityForest, P.city, P.road, P.wonder, P.roadBend, P.cityEdge, P.road, P.roadBend, P.road];

/** A player's stored state in the ledger's format: a village of `extra` parcels and `plans` placed, the rewards given. */
function player(extra: number, plans: readonly number[], rewards: { pending: number; offer: [number, number, number] | null }, cobbles: number) {
  const cells = grow(square(1), extra);
  const tiles = grown(cells, plans);
  const copies = new Array<number>(SKIN_PLANS).fill(0);
  for (const t of tiles) copies[t.plan - 1]! += 1;
  copies[P.wonder - 1]! += 2;
  return {
    cobbles,
    credits: 0,
    achievementsClaimed: "0",
    days: {},
    weeks: {},
    owned: {},
    active: new Array<number>(SKIN_PLANS).fill(0),
    shares: "0",
    paved: MOCK_STARTING_PAVED.toString(),
    usdc: "0",
    village: { parcels: cells.slice(9), tiles },
    rewards: { pending: rewards.pending, opened: 4, offer: rewards.offer, index: 4, copies },
  };
}

function seeded(offer: [number, number, number] | null) {
  const players = {
    [`0x${BigInt(PLAYER_ID).toString(16)}`]: player(4, MIXED.slice(0, 9), { pending: offer ? 1 : 2, offer }, 85),
    [RIVAL]: player(20, [...MIXED, ...MIXED].slice(0, 26), { pending: 0, offer: null }, 0),
  };
  const data = new Map([[MOCK_KEY, JSON.stringify({ version: 1, players, vault: { assets: "0", supply: "0" }, transactions: 0 })]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

/** The app's sources on the mock ledger, and a connector whose account is the stories' player, its writes the ledger's. */
function environment(offer: [number, number, number] | null) {
  const store = seeded(offer);
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 600 });
  const views = mockGameViews(new FakeGameViews(), ledger);
  const indexer = new IndexerClient({ url: "http://indexer.invalid/", fetch: (() => Promise.reject(new Error("No indexer in this story"))) as typeof fetch });
  const sources: DataSources = { views, events: { playerGames: async () => [] }, economy: null, pool: null, indexer, signer: null };
  const account: WriteAccount = { address: PLAYER_ID, execute: async () => ({ transaction_hash: "0x0" }) };
  const load: LoadConnector = async () => ({
    probe: async () => account,
    connect: async () => account,
    disconnect: async () => undefined,
    username: async () => "bal7hazar",
    signer: (from) => mockSigner({ address: from.address } as unknown as GameSigner, ledger),
  });
  return { sources, load, client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
}

/** The page on its route, in the stories' router (the preview's, at `parameters.route`). */
function VillagePage({ offer = null }: { offer?: [number, number, number] | null }) {
  const [env] = useState(() => environment(offer));
  return (
    <QueryClientProvider client={env.client}>
      <WalletProvider sources={env.sources} load={env.load}>
        <MockMarkProvider value>
          <LazyMotion features={domMax}>
            <Routes>
              <Route path="/village/:player?" element={<Page />} />
            </Routes>
            <Toaster />
          </LazyMotion>
        </MockMarkProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}

/** The player's village: 13 cells, 9 tiles on their tier's base, the score from the engine, 85 Cobbles; two rewards wait (Open). */
export const Board: Story = { parameters: { route: "/village" }, render: () => <VillagePage /> };
/** A reward opened: its three tiles under the board; drag or tap one onto a lit cell, onto a ringed tile, or take 5 Cobbles. */
export const Reward: Story = { parameters: { route: "/village" }, render: () => <VillagePage offer={[P.road, P.wonder, P.roadCross]} /> };
/** Another player's village from the PvP scout: read-only, their score, level and tiers. */
export const Visit: Story = { parameters: { route: `/village/${RIVAL}?from=scout` }, render: () => <VillagePage /> };
