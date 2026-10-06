import type { PavedRpc } from "../src/paved-client";
import type { Recording } from "./recorder";

/** A provider that answers from a recording of devnet, and fails on anything it did not record. */
export function replay(record: Recording): PavedRpc & { asked: string[] } {
  const asked: string[] = [];
  const sameCall = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => BigInt(v) === BigInt(b[i]));
  return {
    asked,
    async callContract(call) {
      asked.push(call.entrypoint);
      // The last recorded answer wins: a view read twice returns the state after the later writes.
      const hit = [...record.calls]
        .reverse()
        .find((c) => BigInt(c.contractAddress) === BigInt(call.contractAddress) && c.entrypoint === call.entrypoint && sameCall(c.calldata, call.calldata));
      if (!hit) throw new Error(`not recorded: ${call.entrypoint}(${call.calldata.join(", ")})`);
      return hit.result;
    },
    async getEvents(filter) {
      asked.push("getEvents");
      const hit = [...record.events]
        .reverse()
        .find((e) => BigInt(e.address) === BigInt(filter.address) && JSON.stringify(e.keys) === JSON.stringify(filter.keys));
      if (!hit) throw new Error(`not recorded: getEvents ${JSON.stringify(filter.keys)}`);
      return { events: hit.events };
    },
    async waitForTransaction(hash) {
      const receipt = record.raw?.[hash];
      if (!receipt) throw new Error(`not recorded: receipt ${hash}`);
      return receipt;
    },
  };
}
