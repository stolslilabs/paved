import { PavedClient, ViewError, createPavedClient, resolveDeployment, toViewError, type DeploymentFile, type GameView } from "@paved/chain";
import { browserStore } from "@paved/game-core";
import { DATA_SOURCE } from "./data-source";
import { MockLedger } from "./mock/ledger";
import { mockGameViews, type ChallengeAccess } from "./mock/overlay";

// The chain client of the app (P5): `PavedClient` on the deployment the build names. Imported only through a dynamic
// `import()` (`routes/sources.ts`), so starknet.js is fetched with the first page that reads the chain, never in the
// first bundle.

/** `contracts/deployments/<network>.json`, keyed by path. */
const FILES = import.meta.glob<{ default: DeploymentFile }>("../../../../contracts/deployments/*.json", { eager: true });

/**
 * The network of the build: `VITE_NETWORK`. The dev server defaults to devnet (as the legacy client did); a production build without
 * it has none, and the chain client refuses (`chainClient`) instead of falling back to devnet.
 */
export const network = (): string => import.meta.env.VITE_NETWORK || (import.meta.env.DEV ? "devnet" : "");

let client: PavedClient | null = null;

/** Calls the read `key` of `target`; a read it does not have is refused as a deployment without it is (`not-configured`). */
export function readOf(target: object, key: PropertyKey, args: unknown[]): unknown {
  const read = (target as Record<PropertyKey, unknown>)[key];
  if (typeof read !== "function") throw new ViewError("not-configured", `${String(key)}: not a read of this deployment's client`);
  return (read as (...a: unknown[]) => unknown).apply(target, args);
}

/** The read `key` of a part of the chain client (`routes/sources.ts`' lazy views and events), as `readOf` calls it. */
export const chainRead = <T extends object>(part: (client: PavedClient) => T, key: PropertyKey, args: unknown[]): unknown => readOf(part(chainClient()), key, args);
let ledger: MockLedger | null = null;

/**
 * The mock ledger of this device (#549), on `localStorage`: one for the app, shared by every overlay (the views here, the
 * economy's, the indexer's, the wallet's writes). Its seller is the deployment's `Setup`, as the fresh deployment sets it.
 */
export function mockLedger(): MockLedger {
  return ledgerOf(chainClient());
}

/** The Challenge of a client, for the game reads an older class answers differently (`mockGameViews`). */
function challengeAccess(real: PavedClient): ChallengeAccess {
  const challenge = real.deployment.addresses.Challenge;
  const codec = real.codecs.Challenge;
  return {
    challenge,
    gameFelts: async (gameId) => {
      try {
        return await real.provider.callContract({ contractAddress: challenge, entrypoint: "game", calldata: codec.encodeCall("game", [gameId]) });
      } catch (error) {
        throw toViewError(error);
      }
    },
    decodeGame: (felts) => {
      try {
        return codec.decodeResult("game", felts) as unknown as GameView;
      } catch (error) {
        throw toViewError(error);
      }
    },
  };
}

function ledgerOf({ deployment }: Pick<PavedClient, "deployment">): MockLedger {
  ledger ??= new MockLedger({ store: browserStore, seller: deployment.addresses.Setup || "0x0" });
  return ledger;
}

/**
 * The client on `contracts/deployments/<VITE_NETWORK>.json`, each `VITE_*` value set overriding the file (`VITE_RPC_URL`,
 * `VITE_CHALLENGE_ADDRESS`, `VITE_SETUP_ADDRESS`, `VITE_DEPLOYED_BLOCK`). A deployment that is not configured throws
 * `createPavedClient`'s `not-configured` view error, which the pages show.
 */
export function chainClient(): PavedClient {
  if (client) return client;
  const name = network();
  if (!name) throw new ViewError("not-configured", "Not connected: this build names no network (set VITE_NETWORK)");
  const file = Object.entries(FILES).find(([path]) => path.endsWith(`/${name}.json`))?.[1].default ?? null;
  // Each value by its own static access: `import.meta.env` as a whole is every `VITE_*` value of the build's environment
  // in a literal, a devnet key included.
  const deployment = resolveDeployment({
    network: name,
    file,
    env: {
      rpcUrl: import.meta.env.VITE_RPC_URL,
      deployedBlock: import.meta.env.VITE_DEPLOYED_BLOCK,
      addresses: { Challenge: import.meta.env.VITE_CHALLENGE_ADDRESS, Setup: import.meta.env.VITE_SETUP_ADDRESS },
    },
  });
  const real = createPavedClient(deployment);
  // The data source `mock` (`data-source.ts`): the views the deployed classes lack come from the device's ledger, the games
  // and every write stay the chain's.
  client = DATA_SOURCE === "mock" ? new PavedClient(real.deployment, real.provider, real.codecs, mockGameViews(real.views, ledgerOf(real), challengeAccess(real))) : real;
  return client;
}
