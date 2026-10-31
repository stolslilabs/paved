import { RefusedReferrerError, ViewError, packReferrer, type Deployment, type EconomyViews, type EventReader, type GameViews, type IndexerClient, type PoolQuoter, type WriteAccount } from "@paved/chain";
import { browserStore } from "@paved/game-core";
import { MockAccountError } from "../../wallet/mock-key";
import { deploymentOf, economyDeploymentOf, network } from "../deployment";
import type { SocialSource } from "../social-source";
import type { GameSigner, Purchases, Settlements, VaultWrites } from "../sources";
import { mockIndexer } from "./indexer";
import { MockLedger } from "./ledger";
import { mockEconomyViews, mockEvents, mockGameViews, mockPool, mockPurchases, mockSettlements, mockSocial, mockVaultWrites } from "./overlay";

// The app's mock (#549, #927): every source of `DataSources` from the device's ledger, and nothing under it. No chain client,
// no economy client and no indexer client is built, no node and no indexer is read: the overlays of `overlay.ts` go over
// `offline` parts, which refuse what the ledger does not answer (`not-configured`, as a deployment without the read) instead
// of sending it. Loaded only through a dynamic `import()` (`routes/sources.ts`, `wallet/mock-connector.ts`) on the data
// source `mock`: the chain's chunk and starknet.js are never fetched (`vite.config.ts` keeps starknet.js out of a mock build).

/** Why a read the ledger does not answer is refused: the mock has no node to send it to. */
export const NOT_ON_THE_MOCK = "not on the mock: the client runs on the device's data alone";

/**
 * A part of the chain the mock has no answer for: each read, by any name, is refused with a `not-configured` view error, as a
 * deployment without it refuses, and nothing is sent. Every name answers a function, so a hook's probe finds one (as the chain
 * path's lazy proxy does, `routes/sources.ts`); `then` is left out, so the part is not taken for a promise.
 */
export function offline<T extends object>(part: string): T {
  return new Proxy({} as T, {
    get: (_target, key) =>
      key === "then"
        ? undefined
        : async () => {
            throw new ViewError("not-configured", `${part}.${String(key)}: ${NOT_ON_THE_MOCK}`);
          },
  });
}

/** The account's writes under the ledger's (`mockSigner`): a write the ledger does not answer is refused before anything is sent. */
export function offlineSigner(account: Pick<WriteAccount, "address">): GameSigner {
  return new Proxy({ address: account.address } as GameSigner, {
    get: (target, key) => (key === "address" ? target.address : key === "then" ? undefined : () => Promise.reject(new MockAccountError())),
  });
}

/** The mock's sources, all on `ledger`: what `routes/sources.ts` gives on `mock` (the signer is the wallet's, `mock-connector.ts`). */
export interface MockAppSources {
  views: GameViews;
  events: Pick<EventReader, "playerGames">;
  economy: EconomyViews;
  pool: PoolQuoter;
  indexer: IndexerClient;
  /** The social features (#952), the ledger's alone. */
  social: SocialSource;
  purchases(signer: GameSigner): Purchases;
  settlements(signer: GameSigner): Settlements;
  vault(signer: GameSigner): VaultWrites;
}

/**
 * The sources of the mock on `ledger`: the game views, the events, the economy's views, the pool and the indexer the ledger's
 * alone; the purchases, the settlement and the Vault's writes of a signer on its address. `deployment`: the build's (its
 * addresses only, for the referrer a purchase sends), null without one.
 */
export function mockAppSources(ledger: MockLedger, deployment: Deployment | null): MockAppSources {
  const economy = mockEconomyViews(offline<EconomyViews>("economy"), ledger);
  const purchases = (signer: GameSigner): Purchases => {
    const offlinePurchases: Purchases = {
      purchase: () => Promise.reject(new MockAccountError()),
      buyPack: () => Promise.reject(new MockAccountError()),
      // The rule of the chain's purchases (`economy-client.ts`), on the ledger's router and seller.
      referrer: async (_kind, referrer) => {
        if (!deployment) return null;
        try {
          const [router, seller] = await Promise.all([economy.router(), economy.seller()]);
          const sent = packReferrer(referrer, signer.address, economyDeploymentOf(deployment), { router, seller });
          return sent === "0x0" ? null : sent;
        } catch (error) {
          if (error instanceof RefusedReferrerError) return null;
          throw error;
        }
      },
      // A hash that is not the ledger's was sent by no one: no node knows it.
      receipt: async () => "unknown",
    };
    return mockPurchases(offlinePurchases, ledger, signer.address);
  };
  return {
    views: mockGameViews(offline<GameViews>("views"), ledger),
    events: mockEvents(offline<Pick<EventReader, "playerGames">>("events"), ledger),
    economy,
    pool: mockPool(ledger),
    indexer: mockIndexer(ledger),
    social: mockSocial(ledger),
    purchases,
    settlements: (signer) => mockSettlements(ledger, signer.address),
    vault: (signer) => mockVaultWrites(ledger, signer.address),
  };
}

/** The build's deployment, null without a network: the mock reads its addresses, never its node. */
function buildDeployment(): Deployment | null {
  const name = network();
  return name ? deploymentOf(name) : null;
}

let ledger: MockLedger | null = null;
let sources: MockAppSources | null = null;

/**
 * The mock ledger of this device (#549), on `localStorage`: one for the app, shared by every source and the wallet. Its seller
 * is the deployment's `Setup`, as the fresh deployment sets it.
 */
export function appLedger(): MockLedger {
  ledger ??= new MockLedger({ store: browserStore, seller: buildDeployment()?.addresses.Setup || "0x0" });
  return ledger;
}

/** The app's mock sources, on `appLedger()`, built once. */
export function appMockSources(): MockAppSources {
  sources ??= mockAppSources(appLedger(), buildDeployment());
  return sources;
}
