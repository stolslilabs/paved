import { WriteError } from "@paved/chain";
import { FIXTURE_ADA } from "@paved/chain/testing";
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

