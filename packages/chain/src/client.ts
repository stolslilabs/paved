import { DojoProvider } from "@dojoengine/core";
import { Account, RpcProvider } from "starknet";
import { DojoConfig } from "./config";
import { setupWorld } from "./bindings/contracts.gen";

export type WorldClient = ReturnType<typeof setupWorld>;

/** Options for entity sync queries (reserved for future Torii polling) */
export interface SyncOptions {
  limit?: number;
  models?: string[];
}

/**
 * Minimal BurnerManager interface.
 * The actual implementation comes from @dojoengine/create-burner at runtime.
 * Defined here so the package compiles without that dep installed.
 */
export interface BurnerManagerLike {
  init(): Promise<void>;
  getActiveAccount(): Account | null;
  create(): Promise<Account>;
  list(): Account[];
  select(address: string): void;
  clear(): void;
}

export interface ChainClient {
  config: DojoConfig;
  provider: DojoProvider;
  worldClient: WorldClient;
  burnerManager: BurnerManagerLike | null;
  masterAccount: Account;

  /** Subscribe to entity updates via Torii polling. */
  subscribeToEntityUpdates(callback: (entity: any) => void): () => void;

  /** Query entities from Torii REST endpoint. */
  getEntities(options?: SyncOptions): Promise<any[]>;
}

export async function createChainClient(config: DojoConfig): Promise<ChainClient> {
  const rpcProvider = new RpcProvider({ nodeUrl: config.rpcUrl });

  const provider = new DojoProvider(config.manifest, config.rpcUrl);
  const worldClient = setupWorld(provider);

  const masterAccount = new Account({
    provider: rpcProvider,
    address: config.masterAddress,
    signer: config.masterPrivateKey,
  });

  // Try to initialize BurnerManager if @dojoengine/create-burner is available
  let burnerManager: BurnerManagerLike | null = null;
  try {
    const { BurnerManager } = await import("@dojoengine/create-burner" as string);
    burnerManager = new BurnerManager({
      masterAccount,
      feeTokenAddress: config.feeTokenAddress,
      accountClassHash: config.accountClassHash,
      rpcProvider,
    }) as BurnerManagerLike;
    await burnerManager.init();
  } catch {
    // @dojoengine/create-burner not installed; burner accounts unavailable
    console.warn("@dojoengine/create-burner not available, burner accounts disabled");
  }

  // Subscription mechanism: simple in-memory pub/sub for entity updates.
  // In production this will be replaced with Torii gRPC streaming.
  const subscriptions: Array<(entity: any) => void> = [];

  return {
    config,
    provider,
    worldClient,
    burnerManager,
    masterAccount,

    subscribeToEntityUpdates(callback: (entity: any) => void) {
      subscriptions.push(callback);
      return () => {
        const idx = subscriptions.indexOf(callback);
        if (idx >= 0) subscriptions.splice(idx, 1);
      };
    },

    async getEntities(_options: SyncOptions = {}) {
      // TODO: Implement Torii REST polling for entities
      // const response = await fetch(`${config.toriiUrl}/entities?...`);
      return [];
    },
  };
}
