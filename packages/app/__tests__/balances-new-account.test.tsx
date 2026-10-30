import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BALANCES_OFFLINE, balancesMessage, useBalances } from "../src/data/balances";
import { fakeSources, renderData } from "./data-fakes";

// WALLET-BALANCES (#918): a key made a moment ago by the local-key connector names an account with nothing on chain, not even
// its contract. Its balances read zero; a read that never reaches the node says so shortly and offers Retry.

/** A counterfactual address, never deployed and never written to: what the first Connect of a new device gives. */
const NEW_ACCOUNT = "0x003f81ae0292b953b6f5b29d0f7f145ed39cd9c21c1a4fdc3c90fe7d0b920534";

vi.mock("../src/wallet/wallet", () => ({ useAccount: () => ({ status: "connected", address: NEW_ACCOUNT }) }));

describe("useBalances, a new account (#918)", () => {
  it("reads zero balances, never an error", async () => {
    const { result } = renderData(() => useBalances().state, fakeSources().sources);
    await waitFor(() => expect(result.current).toEqual({ status: "ready", usdc: 0n, paved: 0n, vpaved: 0n, cobbles: 0 }));
  });

  it("a node it cannot reach shows a short message, and Retry reads again", async () => {
    const f = fakeSources();
    // The browser's own text for a request that got no answer (a failed CORS preflight included: Cartridge's 410 on Sepolia).
    f.economy.fail = "Failed to fetch";
    const { result } = renderData(() => useBalances(), f.sources);
    await waitFor(() => expect(result.current.state).toEqual({ status: "error", message: BALANCES_OFFLINE, retrying: false }));
    f.economy.fail = null;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state).toMatchObject({ status: "ready", usdc: 0n, paved: 0n }));
  });
});

describe("balancesMessage", () => {
  it.each(["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed", "fetch failed", 'JSON Parse error: Unexpected identifier "starknet"'])("%s: the network cannot be reached", (text) => {
    expect(balancesMessage(new TypeError(text))).toBe(BALANCES_OFFLINE);
  });

  it("any other failure keeps its own text", () => {
    expect(balancesMessage(new Error("Not available on this network yet."))).toBe("Not available on this network yet.");
  });
});
