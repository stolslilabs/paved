import { WriteError } from "@paved/chain";
import { FIXTURE_ADA } from "@paved/chain/testing";
import { CENTER, OrientationType, replayVrfChallenge, type GameKey } from "@paved/game-core";
import type { DataSources, GameSigner } from "../src/data";
import { MOCK_STARTING_BALANCES, MockLedger, type TokenBalances } from "../src/data/mock/ledger";
import { mockIndexer } from "../src/data/mock/indexer";
import { mockEconomyViews, mockEvents, mockGameViews, mockPool, mockPurchases, mockSettlements, mockSigner, mockVaultWrites } from "../src/data/mock/overlay";
import type { Purchases } from "../src/data/sources";
import { fakeSources, memoryStore } from "./data-fakes";

// The mock's sources for the tests (MOCK-FIRST): the ledger's overlays over a chain whose Setup and Vault predate cobbles v1, as
// Sepolia's do, and the ledger's indexer (#927), wired as `chain-client.ts`, `economy-client.ts`, `routes/sources.ts` and the
// connector wire them in the app.

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
    indexer: mockIndexer(ledger),
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

const ORIENTATIONS = Object.values(OrientationType);

/**
 * A Challenge game of `account` bought and played to the deck's end on the ledger (#927): each tile where it scores most, from
 * the game's reads as the board opens it (`replayVrfChallenge`), else a discard. The same game for the same clock.
 */
export async function playGame(ledger: MockLedger, account: string, stake = 1) {
  const { gameId } = await buyGame(ledger, account, stake);
  const key: GameKey = { mode: "challenge", gameId };
  const writes = ledger.writesFor(account);
  while (!(await ledger.game(key)).over) {
    const [game, tiles, draw] = await Promise.all([ledger.game(key), ledger.tiles(key), ledger.draw(key)]);
    const engine = replayVrfChallenge(BigInt(await ledger.initialSeed(key)), tiles, game, draw);
    let best: { placement: ReturnType<typeof engine.legalPlacements>[number]; score: number } | null = null;
    for (const placement of engine.legalPlacements(engine.hand!.plan)) {
      const score = engine.clone().build(placement).score;
      if (!best || score > best.score) best = { placement, score };
    }
    if (best) await writes.build(key, { orientation: ORIENTATIONS.indexOf(best.placement.orientation), x: CENTER + best.placement.x, y: CENTER + best.placement.y });
    else await writes.discard(key);
  }
  return { gameId, score: (await ledger.game(key)).score };
}

/** A Challenge game of `account` bought and surrendered at once on the ledger: over, score 0. */
export async function surrenderedGame(ledger: MockLedger, account: string, stake = 1) {
  const { gameId } = await buyGame(ledger, account, stake);
  await ledger.writesFor(account).surrender({ mode: "challenge", gameId });
  return gameId;
}
