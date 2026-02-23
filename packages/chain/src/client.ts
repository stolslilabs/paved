import { DojoConfig } from "./config";

export interface SyncOptions {
  limit?: number;
  models?: string[];
}

export interface ChainClient {
  config: DojoConfig;
  subscribeToEntityUpdates(callback: (entity: any) => void): () => void;
  getEntities(options?: SyncOptions): Promise<any[]>;
}

export async function createChainClient(config: DojoConfig): Promise<ChainClient> {
  const subscriptions: Array<(entity: any) => void> = [];

  return {
    config,

    subscribeToEntityUpdates(callback: (entity: any) => void) {
      subscriptions.push(callback);
      return () => {
        const idx = subscriptions.indexOf(callback);
        if (idx >= 0) subscriptions.splice(idx, 1);
      };
    },

    async getEntities(options: SyncOptions = {}) {
      // Placeholder: In production, this queries Torii for entities
      // The actual implementation will use @dojoengine/sdk's client
      return [];
    },
  };
}
