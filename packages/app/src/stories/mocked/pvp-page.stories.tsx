import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domMax } from "motion/react";
import { Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { FakeGameViews, SKIN_PLANS, type IndexerClient, type WriteAccount } from "@paved/chain";
import { AttackRun } from "@paved/game-core";
import { attackV2Board } from "../../data/free-attack";
import { MockMarkProvider } from "../../components/containers/mock-mark";
import type { DataSources, GameSigner } from "../../data/sources";
import { MOCK_KEY, MOCK_STARTING_PAVED, MockLedger } from "../../data/mock/ledger";
import { mockGameViews, mockIndexer, mockSigner } from "../../data/mock/overlay";
import { mockRival } from "../../data/mock/pvp";
import { APP_MANIFEST } from "../../mocks/assets";
import { PLAYER_ID } from "../../mocks/players";
import { PHONE_375, WIDE_1440 } from "../../components/scenes/viewports";
import PvpPage from "../../routes/pages/pvp";
import PvpLeaguePage from "../../routes/pages/pvp-league";
import PvpMatchPage from "../../routes/pages/pvp-match";
import PvpReplayPage from "../../routes/pages/pvp-replay";
import PvpResultPage from "../../routes/pages/pvp-result";
import { WalletProvider, type LoadConnector } from "../../wallet/wallet";

/**
 * The PvP pages (#647 PR 2) as the app wires them, on the mock data source (Sepolia's, until `Matchmaker` and `Arena` are
 * deployed): the pages' own hooks read the mock ledger (`data/mock/ledger.ts`) through its overlay, and their writes go to
 * the ledger, whose rules are the contracts'. Each story seeds the ledger with its own writes (a search, an attack's moves),
 * then mounts the route. The player is connected (a stand-in for the controller); the opponents are the mock's rival
 * villages (`data/mock/pvp.ts`). The mock serves PvP v2's attack (#740, #741), so the search, the scout and the attack are
 * v2's: the rival's free village, the deck of ceil(1.15 x S) on an open board, the tile in hand and the next two.
 */
const meta = { title: "Pages/PvP", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** The tile art's manifest, served in memory as the village page's story does. */
const served = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) =>
  String(input instanceof Request ? input.url : input).endsWith("renderer-assets/manifest.json")
    ? Promise.resolve(new Response(JSON.stringify(APP_MANIFEST), { headers: { "content-type": "application/json" } }))
    : served(input, init);

const ME = `0x${BigInt(PLAYER_ID).toString(16)}`;

/** The player's stored state: a founded village (in the matchmaker), `cobbles`, and the PvP record given. */
function seeded(cobbles: number, pvp?: Record<string, unknown>) {
  const player = {
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
    village: { parcels: [], tiles: [] },
    ...(pvp ? { pvp } : {}),
  };
  const data = new Map([[MOCK_KEY, JSON.stringify({ version: 1, players: { [ME]: player }, vault: { assets: "0", supply: "0" }, transactions: 0 })]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

/** Plays `count` moves of the open attack (each tile where it fits first, else discarded), or to its end. */
async function play(ledger: MockLedger, count = Infinity) {
  const writes = ledger.writesFor(PLAYER_ID);
  for (let i = 0; i < count; i++) {
    const attack = await ledger.pvpAttack(PLAYER_ID);
    if (attack.status !== 1) return;
    const deck = await ledger.pvpDeck(PLAYER_ID, attack.id);
    const moves = await ledger.pvpMoves(PLAYER_ID, attack.id);
    const run = AttackRun.replay({ territory: mockRival(attack.defender)!.cells }, moves.map((m) => (m.discard ? { plan: m.plan, discard: true as const } : { ...m, discard: false as const })));
    // The plain player of the fakes: the cell where the tile scores most.
    let best: { cell: { x: number; y: number }; orientation: number; points: number } | null = null;
    for (const cell of run.slots(deck.hand)) {
      for (const orientation of run.orientations(deck.hand, cell)) {
        const points = run.preview(deck.hand, orientation, cell) ?? -1;
        if (!best || points > best.points) best = { cell, orientation, points };
      }
    }
    await writes.playAttack(best ? { discard: false, orientation: best.orientation, cell: best.cell } : { discard: true });
  }
}

/** Plays `count` moves of the open v2 attack, as `play` does, on an unbounded board. */
async function playV2(ledger: MockLedger, count: number) {
  const writes = ledger.writesFor(PLAYER_ID);
  for (let i = 0; i < count; i++) {
    const { attack } = await ledger.attackV2(PLAYER_ID);
    const hand = attack?.status === "open" ? attack.view[0] : undefined;
    if (hand === undefined) return;
    const run = attackV2Board(attack!);
    let best: { cell: { x: number; y: number }; orientation: number; points: number } | null = null;
    for (const cell of run.slots(hand)) {
      for (const orientation of run.orientations(hand, cell)) {
        const points = run.preview(hand, orientation, cell) ?? -1;
        if (!best || points > best.points) best = { cell, orientation, points };
      }
    }
    await writes.playAttackV2(best ? { discard: false, orientation: best.orientation, cell: best.cell } : { discard: true });
  }
}

interface Setup {
  cobbles?: number;
  pvp?: Record<string, unknown>;
  /** Writes made before the page mounts, on a ledger with no latency. */
  prepare?: (ledger: MockLedger) => Promise<void>;
  /** The page's writes' latency (a search left waiting: long). */
  latencyMs?: number;
}

/** An indexer stand-in for the mock's overlay: its head only (the PvP lists and the rivals' names are the ledger's). */
const HEAD = {
  head: async () => ({ data: { state: "following", chainId: "0x1", fromBlock: 0, contracts: {} }, head: { number: 1, hash: "0x1", timestamp: Math.floor(Date.now() / 1000) }, behind: 0, freshness: "fresh" }),
  player: async (id: string) => ({ data: { player: { playerId: id, name: null, created: null }, stats: null }, head: { number: 1, hash: "0x1", timestamp: 0 }, behind: 0, freshness: "fresh" }),
} as unknown as IndexerClient;

function useEnvironment({ cobbles = 12, pvp, prepare, latencyMs = 600 }: Setup) {
  const [env, setEnv] = useState<{ sources: DataSources; load: LoadConnector; client: QueryClient } | null>(null);
  useEffect(() => {
    const store = seeded(cobbles, pvp);
    void (async () => {
      await prepare?.(new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, lock: (s) => Promise.resolve(s()) }));
      const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs, lock: (s) => Promise.resolve(s()) });
      const sources: DataSources = { views: mockGameViews(new FakeGameViews(), ledger), events: { playerGames: async () => [] }, economy: null, pool: null, indexer: mockIndexer(HEAD, ledger), signer: null };
      const account: WriteAccount = { address: PLAYER_ID, execute: async () => ({ transaction_hash: "0x0" }) };
      const load: LoadConnector = async () => ({
        probe: async () => account,
        connect: async () => account,
        disconnect: async () => undefined,
        username: async () => "bal7hazar",
        signer: (from) => mockSigner({ address: from.address } as unknown as GameSigner, ledger),
      });
      setEnv({ sources, load, client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) });
    })();
  }, [cobbles, pvp, prepare, latencyMs]);
  return env;
}

/** The PvP routes, in the stories' router (the preview's, at `parameters.route`). */
function PvpPages(setup: Setup) {
  const env = useEnvironment(setup);
  if (!env) return null;
  return (
    <QueryClientProvider client={env.client}>
      <WalletProvider sources={env.sources} load={env.load}>
        <MockMarkProvider value>
          <LazyMotion features={domMax}>
            <Routes>
              <Route path="/pvp" element={<PvpPage />} />
              <Route path="/pvp/result/:id" element={<PvpResultPage />} />
              <Route path="/pvp/replay/:attacker/:id" element={<PvpReplayPage />} />
              <Route path="/pvp/league" element={<PvpLeaguePage />} />
              <Route path="/pvp/match/:id" element={<PvpMatchPage />} />
            </Routes>
            <Toaster />
          </LazyMotion>
        </MockMarkProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}

const search = (ledger: MockLedger) => ledger.writesFor(PLAYER_ID).drawOpponent("search").then(() => undefined);
/** PvP v2: the player's free village founded (its starter layout), then a rival drawn. */
const foundV2 = (ledger: MockLedger) => ledger.writesFor(PLAYER_ID).foundFreeVillage().then(() => undefined);
const searchV2 = async (ledger: MockLedger) => {
  await foundV2(ledger);
  await ledger.writesFor(PLAYER_ID).drawOpponentV2("search");
};
const attack = async (ledger: MockLedger) => {
  await search(ledger);
  await ledger.writesFor(PLAYER_ID).startAttack();
};
/** The search's receipt comes after 12 s: long enough to see (and capture) the wait, then the village found and its scout. */
const SEARCH: Setup = { latencyMs: 12_000, prepare: foundV2 };
const SCOUT: Setup = { prepare: searchV2 };
const ATTACK: Setup = { prepare: async (ledger) => (await searchV2(ledger), await ledger.writesFor(PLAYER_ID).startAttackV2(), await playV2(ledger, 5)) };
/** A v2 attack played to its end (the mock's first, id 1): its end screen on reload or a link (#790). */
const END: Setup = { prepare: async (ledger) => (await searchV2(ledger), await ledger.writesFor(PLAYER_ID).startAttackV2(), await playV2(ledger, Infinity)) };
/** A v2 attack one tile from its end: the last move opens the end screen in place of the attack (#790). */
const LAST_MOVE: Setup = {
  prepare: async (ledger) => {
    await searchV2(ledger);
    await ledger.writesFor(PLAYER_ID).startAttackV2();
    const { attack } = await ledger.attackV2(PLAYER_ID);
    await playV2(ledger, attack!.deck - 1);
  },
};
const RESULT: Setup = { pvp: { crowns: 380, draws: 0, match: null, attacks: [], shieldUntil: 0, season: 1, seasonAttacks: 2, peak: 0 }, prepare: async (ledger) => (await attack(ledger), await play(ledger)) };
const LEAGUE: Setup = { pvp: { crowns: 1172, draws: 9, match: null, attacks: [], shieldUntil: 0, season: 1, seasonAttacks: 3, peak: 7 } };
const REPLAY: Setup = RESULT;
/**
 * Two v2 attacks played to their end, each answered by the rival at the next search (#786): the mock's rivals live on no
 * device, so the rival attacked last attacks the player's village then. The list: d2, a2, d1, a1, newest first.
 */
const MATCHES: Setup = {
  pvp: LEAGUE.pvp,
  prepare: async (ledger) => {
    await searchV2(ledger);
    for (let i = 0; i < 2; i++) {
      await ledger.writesFor(PLAYER_ID).startAttackV2();
      await playV2(ledger, Infinity);
      await ledger.writesFor(PLAYER_ID).drawOpponentV2("search");
    }
  },
};

/** The search's waiting screen: the matchmaker's draw on its way (its receipt 12 s off), under the clouds; then the village found. */
export const Search: Story = { parameters: { route: "/pvp" }, render: () => <PvpPages {...SEARCH} /> };
/** The scout of the village drawn: its score, each star's points (80 / 90 / 100 %) and crowns, the deck the attack will have. */
export const Scout: Story = { parameters: { route: "/pvp" }, render: () => <PvpPages {...SCOUT} /> };
/** A v2 attack five moves in: an open board, the tile in hand and the next two, the deck left, the score against the marks. */
export const Attack: Story = { parameters: { route: "/pvp" }, render: () => <PvpPages {...ATTACK} /> };
/** A v2 attack's end screen (#790): the stars, the score, the crowns and the league, the XP, the chest won, every closing. */
export const End: Story = { parameters: { route: "/pvp/result/1" }, render: () => <PvpPages {...END} /> };
/** A v2 attack at its last tile: placing it opens the end screen at `/pvp/result/1`, and Back goes to the league. */
export const EndPhone: Story = { ...End, ...PHONE_375 };
export const EndWide: Story = { ...End, ...WIDE_1440 };
export const LastMove: Story = { parameters: { route: "/pvp" }, render: () => <PvpPages {...LAST_MOVE} /> };
/** v1's attack end (an id that is not the last v2 attack's): the stars, the crowns moved, the village reward the settlement granted (Open draws its tiles). */
export const Result: Story = { parameters: { route: "/pvp/result/1" }, render: () => <PvpPages {...RESULT} /> };
/** The attack replayed move by move. */
export const Replay: Story = { parameters: { route: `/pvp/replay/${ME}/1` }, render: () => <PvpPages {...REPLAY} /> };
/**
 * The league: Bronze II, the way to Bronze I, the season's end and its reward after five attacks, and under Attack the latest
 * attacks and defences (#786): none yet on this device.
 */
export const League: Story = { parameters: { route: "/pvp/league" }, render: () => <PvpPages {...LEAGUE} /> };
export const LeaguePhone: Story = { ...League, ...PHONE_375 };
export const LeagueWide: Story = { ...League, ...WIDE_1440 };
/** The league's latest attacks and defences as cards (#786), each on its side's illustration (#834); a tap opens its match. */
export const LeagueMatches: Story = { parameters: { route: "/pvp/league" }, render: () => <PvpPages {...MATCHES} /> };
export const LeagueMatchesPhone: Story = { ...LeagueMatches, ...PHONE_375 };
export const LeagueMatchesWide: Story = { ...LeagueMatches, ...WIDE_1440 };
/** The player's attack's match (#786): the rival's village from the snapshot; the switch and a flick show the build. */
export const MatchAttack: Story = { parameters: { route: "/pvp/match/a1" }, render: () => <PvpPages {...MATCHES} /> };
export const MatchAttackPhone: Story = { ...MatchAttack, ...PHONE_375 };
export const MatchAttackWide: Story = { ...MatchAttack, ...WIDE_1440 };
/** A rival's attack on the player's village: the village as it was then, and the rival's build. */
export const MatchDefence: Story = { parameters: { route: "/pvp/match/d1" }, render: () => <PvpPages {...MATCHES} /> };
export const MatchDefencePhone: Story = { ...MatchDefence, ...PHONE_375 };
export const MatchDefenceWide: Story = { ...MatchDefence, ...WIDE_1440 };
