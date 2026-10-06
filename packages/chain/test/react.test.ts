import { describe, expect, test } from "vitest";
import { resolveDeployment } from "../src/deployment";
import { connectionStatus } from "../src/react";

const configured = resolveDeployment({
  network: "devnet",
  env: { rpcUrl: "http://x", addresses: { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" } },
});

describe("connectionStatus", () => {
  test("not-configured whenever an address or the RPC URL is missing, account or not", () => {
    const off = resolveDeployment({ network: "devnet" });
    expect(connectionStatus(off, null)).toBe("not-configured");
    expect(connectionStatus(off, { address: "0x5", execute: async () => ({ transaction_hash: "0x0" }) })).toBe("not-configured");
  });

  test("read-only without an account, ready with one", () => {
    expect(connectionStatus(configured, null)).toBe("read-only");
    expect(connectionStatus(configured, { address: "0x5", execute: async () => ({ transaction_hash: "0x0" }) })).toBe("ready");
  });
});
