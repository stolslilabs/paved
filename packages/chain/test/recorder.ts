import type { RawEvent } from "../src/codec";
import type { PavedRpc } from "../src/paved-client";

/** RPC answers recorded from devnet, replayed by the unit tests. */
export interface Recording {
  addresses?: Record<string, string>;
  player?: string;
  other?: string;
  calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[]; result: string[] }>;
  events: Array<{ address: string; keys: string[][]; events: RawEvent[] }>;
  /** Transaction hash of each named write. */
  receipts: Record<string, string>;
  /** Raw receipts by transaction hash (status and events only). */
  raw?: Record<string, { execution_status?: string; events: RawEvent[] }>;
  /** Error messages of the reverting views, as the node gave them. */
  errors: Record<string, string>;
}

function rawEvent(e: any): RawEvent {
  return { from_address: e.from_address, keys: e.keys, data: e.data };
}

/** Wraps a provider and records what the client layer asks and gets. */
export function recording(provider: PavedRpc, record: Recording): PavedRpc {
  record.raw ??= {};
  return {
    async callContract(call) {
      const result = await provider.callContract(call);
      record.calls.push({ ...call, result: [...result] });
      return result;
    },
    async getEvents(filter) {
      const chunk = await provider.getEvents(filter);
      if (filter.continuation_token) throw new Error("recorder: pages are not recorded");
      if (chunk.continuation_token) throw new Error("recorder: a chunk had more pages");
      record.events.push({ address: filter.address, keys: filter.keys, events: chunk.events.map((e: any) => ({ ...rawEvent(e), block_number: e.block_number, transaction_hash: e.transaction_hash })) });
      return chunk;
    },
    async waitForTransaction(hash, options) {
      const receipt: any = await provider.waitForTransaction(hash, options);
      record.raw![hash] = { execution_status: receipt.execution_status, events: (receipt.events ?? []).map(rawEvent) };
      return receipt;
    },
  };
}
