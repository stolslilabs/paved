import { WriteError } from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_HEAD } from "@paved/chain/testing";
import type { DataSources, GameSigner } from "../src/data";
import { MOCK_STARTING_BALANCES, MockLedger, type TokenBalances } from "../src/data/mock/ledger";
import { mockEconomyViews, mockEvents, mockGameViews, mockIndexer, mockPool, mockPurchases, mockSettlements, mockSigner, mockVaultWrites } from "../src/data/mock/overlay";
import type { Purchases } from "../src/data/sources";
import { fakeSources, memoryStore } from "./data-fakes";

// The mock's sources for the tests (MOCK-FIRST): the ledger's overlays over a chain whose Setup, Vault and indexer predate
// cobbles v1, as Sepolia's do, wired as `chain-client.ts`, `economy-client.ts` and the connector wire them in the app.

const PLAYER = FIXTURE_ADA;
const USDC = 1_000_000n;

/** Sepolia's chain: no Cobbles on the indexer's definitions, none of the ledger, the packs, the skins or the Vault on chain. */
export function sepoliaChain() {
  const f = fakeSources();
  const strip = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== "cobbles" && k !== "cobbles_kind"));
  f.fixture.quests = f.fixture.quests.map(strip);
  f.fixture.achievements = f.fixture.achievements.map(strip);
  // The chain's tokens: USDC from the faucet, no PAVED yet.
  f.economy.setBalance("usdc", PLAYER, 100n * USDC);
  return f;
}

/**
 * Ada's day on the fixture's indexer (#869): the fixture's dailies `done` (of quests 1 to 4, done every day), and `games`
 * Challenge games over on `day` beside the fixture's own (one on its day): the fifth daily's count (`data/mock/dailies.ts`).
 */
export function playDailies(f: ReturnType<typeof sepoliaChain>, done: readonly number[], games = 0, day = Math.floor(FIXTURE_HEAD.timestamp / 86_400), free = false) {
  f.fixture.progress.set(PLAYER, { quests: new Map(done.map((id) => [id, { count: Number.MAX_SAFE_INTEGER, completed_at: day * 86_400 + 3_600 }])), achievements: new Map() });
  // A copy: the fixture's rows are shared by every fixture of the run.
  f.fixture.games = [...f.fixture.games];
  for (let i = 0; i < games; i++) {
    const end = day * 86_400 + 7_200 + i * 600;
    f.fixture.games.push({ contract: "challenge", game_id: 5_000 + f.fixture.games.length, player_id: PLAYER, mode: 1, start_time: end - 500, day_id: day, over: true, score: 90, counted_day_id: day, end_time: end, token_id: null, free });
  }
  // Newest first, as the indexer pages them (start time, then contract, then id, descending).
  const key = (g: Record<string, unknown>) => `${g.start_time}:${g.contract}:${String(g.game_id).padStart(10, "0")}`;
  f.fixture.games.sort((a, b) => (key(a) < key(b) ? 1 : -1));
}

/**
 * A paid Challenge game of Ada started at `start` and surrendered at `surrenderedAt` (#869): on the fixture's indexer as the
 * contract leaves a game over on a later UTC day than its start (no end time, counted in no day), and its surrender's time in
 * the ledger, as the mock's signer records it.
 */
export async function surrenderGame(f: ReturnType<typeof sepoliaChain>, ledger: MockLedger, gameId: number, start: number, surrenderedAt: number) {
  f.fixture.games = [...f.fixture.games, { contract: "challenge", game_id: gameId, player_id: PLAYER, mode: 1, start_time: start, day_id: Math.floor(start / 86_400), over: true, score: 40, counted_day_id: 0, end_time: 0, token_id: null, free: false }];
  f.fixture.games.sort((a, b) => b.start_time - a.start_time);
  await ledger.recordSurrender(PLAYER, gameId, surrenderedAt);
}

/**
 * The mock: the ledger's overlays over Sepolia's chain, as `chain-client.ts`, `economy-client.ts` and the connector wire them.
 * `starting`: what a new account holds in the ledger (the app's, `MOCK_STARTING_BALANCES`, by default).
 */
export function mockImplementation(store = memoryStore(), starting: TokenBalances = MOCK_STARTING_BALANCES, now?: () => number) {
  const f = sepoliaChain();
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, starting, ...(now ? { now } : {}) });
  const chainPurchases: Purchases = { purchase: () => Promise.reject(new WriteError("not in this test")), buyPack: () => Promise.reject(new WriteError("no buy_pack on this class")), referrer: async () => null, receipt: async () => "unknown" };
  const sources: DataSources = {
    ...f.sources,
    views: mockGameViews(f.views, ledger),
    events: mockEvents(f.sources.events, ledger),
    economy: mockEconomyViews(f.economy, ledger),
    pool: mockPool(ledger),
    indexer: mockIndexer(f.indexer, ledger),
    signer: mockSigner({ address: PLAYER } as unknown as GameSigner, ledger),
    purchases: (signer) => mockPurchases(chainPurchases, ledger, signer.address),
    vault: (signer) => mockVaultWrites(ledger, signer.address),
    settlements: (signer) => mockSettlements(ledger, signer.address),
  };
  return { sources, ledger, store, chain: f };
}


/** A Challenge game of `stake` bought by `account` on the ledger (#927), at the price and the pool's quote of the mock. */
export async function buyGame(ledger: MockLedger, account: string, stake = 1) {
  const quote = await ledger.quote(stake);
  return ledger.writesFor(account).purchase({ stake, confirmedPrice: quote.price, confirmedMinOut: 1n, referrer: null });
}
