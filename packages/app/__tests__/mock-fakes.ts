import { WriteError } from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_HEAD } from "@paved/chain/testing";
import type { DataSources, GameSigner } from "../src/data";
import { MockLedger } from "../src/data/mock/ledger";
import { mockEconomyViews, mockGameViews, mockIndexer, mockPurchases, mockSigner, mockVaultWrites } from "../src/data/mock/overlay";
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
export function playDailies(f: ReturnType<typeof sepoliaChain>, done: readonly number[], games = 0, day = Math.floor(FIXTURE_HEAD.timestamp / 86_400)) {
  f.fixture.progress.set(PLAYER, { quests: new Map(done.map((id) => [id, { count: Number.MAX_SAFE_INTEGER, completed_at: day * 86_400 + 3_600 }])), achievements: new Map() });
  // A copy: the fixture's rows are shared by every fixture of the run.
  f.fixture.games = [...f.fixture.games];
  for (let i = 0; i < games; i++) {
    const end = day * 86_400 + 7_200 + i * 600;
    f.fixture.games.push({ contract: "challenge", game_id: 5_000 + f.fixture.games.length, player_id: PLAYER, mode: 1, start_time: end - 500, day_id: day, over: true, score: 90, counted_day_id: day, end_time: end, token_id: null, free: false });
  }
  // Newest first, as the indexer pages them (start time, then contract, then id, descending).
  const key = (g: Record<string, unknown>) => `${g.start_time}:${g.contract}:${String(g.game_id).padStart(10, "0")}`;
  f.fixture.games.sort((a, b) => (key(a) < key(b) ? 1 : -1));
}

/** The mock: the ledger's overlays over Sepolia's chain, as `chain-client.ts`, `economy-client.ts` and the connector wire them. */
export function mockImplementation(store = memoryStore()) {
  const f = sepoliaChain();
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0 });
  const chainBalances = { paved: () => f.economy.pavedBalance(PLAYER), usdc: () => f.economy.usdcBalance(PLAYER) };
  const chainPurchases: Purchases = { purchase: () => Promise.reject(new WriteError("not in this test")), buyPack: () => Promise.reject(new WriteError("no buy_pack on this class")), referrer: async () => null, receipt: async () => "unknown" };
  const sources: DataSources = {
    ...f.sources,
    views: mockGameViews(f.views, ledger),
    economy: mockEconomyViews(f.economy, ledger),
    indexer: mockIndexer(f.indexer, ledger),
    signer: mockSigner({ address: PLAYER } as unknown as GameSigner, ledger),
    purchases: (signer) => mockPurchases(chainPurchases, ledger, signer.address, chainBalances),
    vault: (signer) => mockVaultWrites(ledger, signer.address, chainBalances),
  };
  return { sources, ledger, store, chain: f };
}

