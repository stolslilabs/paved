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
export declare function createChainClient(config: DojoConfig): Promise<ChainClient>;
//# sourceMappingURL=client.d.ts.map