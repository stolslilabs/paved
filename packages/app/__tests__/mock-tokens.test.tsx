import { slow } from "../test-slow";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAUCET_USDC_AMOUNT } from "@paved/chain";
import { App } from "../src/App";
import { MOCK_KEY, MOCK_STARTING_BALANCES, MockLedger } from "../src/data/mock/ledger";
import { mockConnector, mockEconomyViews, mockSigner } from "../src/data/mock/overlay";
import type { GameSigner } from "../src/data/sources";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { memoryStore } from "./data-fakes";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The tokens on the mock (#927, PR 3 of 6): USDC, PAVED and the Vault's vPAVED are the ledger's, read from no node. A new account
// holds the faucet's USDC and no PAVED (open point 1); "Get test USDC" is the ledger's `mint`, always there, with no cap.

const P = 10n ** 18n;
const USDC = 1_000_000n;
const WAIT = { timeout: slow(8000) };

const ledgerOn = (store = memoryStore()) => new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0 });

describe("the mock's tokens (#927)", () => {
  it("a new account holds the faucet's USDC, no PAVED and no vPAVED", async () => {
    expect(MOCK_STARTING_BALANCES).toEqual({ usdc: FAUCET_USDC_AMOUNT, paved: 0n });
    const ledger = ledgerOn();
    expect(await ledger.usdcBalance("0x5f1")).toBe(100n * USDC);
    expect(await ledger.pavedBalance("0x5f1")).toBe(0n);
    expect((await ledger.vault("0x5f1")).shares).toBe(0n);
    // No PAVED to deposit: the Vault refuses before anything moves.
    await expect(ledger.writesFor("0x5f1").deposit(P, { confirmedAmount: P })).rejects.toMatchObject({ name: "VaultBalanceError" });
  });

  it("reads every balance from the ledger: the chain's economy is never asked", async () => {
    const s = mockImplementation();
    const usdc = vi.spyOn(s.chain.economy, "usdcBalance");
    const paved = vi.spyOn(s.chain.economy, "pavedBalance");
    const vault = vi.spyOn(s.chain.economy, "vault");
    // The chain's fakes hold other figures: the ledger's are read.
    s.chain.economy.setBalance("usdc", "0x5f1", 7n * USDC);
    s.chain.economy.setBalance("paved", "0x5f1", 9n * P);
    const economy = mockEconomyViews(s.chain.economy, s.ledger);
    expect(await economy.usdcBalance("0x5f1")).toBe(100n * USDC);
    expect(await economy.pavedBalance("0x5f1")).toBe(0n);
    expect((await economy.vault("0x5f1")).shares).toBe(0n);
    expect([usdc, paved, vault].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
  });

  it("'Get test USDC' mints the faucet's 100 USDC each time, with no cap, kept on the device; the chain's mint is never sent", async () => {
    const store = memoryStore();
    const ledger = ledgerOn(store);
    const chainMint = vi.fn(() => Promise.reject(new Error("sent to the chain")));
    const signer = mockSigner({ address: "0x5f1", mint: chainMint } as unknown as GameSigner, ledger);
    const first = await signer.mint();
    expect(first.transactionHash).toMatch(/^0x6d6f636b/);
    expect(first.events).toEqual([expect.objectContaining({ name: "Transfer", fields: { from: "0x0", to: "0x5f1", value: FAUCET_USDC_AMOUNT } })]);
    // Past the contract's 20,000 USDC an address: the mock's faucet never runs dry.
    for (let i = 0; i < 205; i++) await ledger.writesFor("0x5f1").mint();
    expect(await ledger.usdcBalance("0x5f1")).toBe(100n * USDC + 206n * FAUCET_USDC_AMOUNT);
    expect(chainMint).not.toHaveBeenCalled();
    // A reload reads the same.
    expect(await ledgerOn(store).usdcBalance("0x5f1")).toBe(100n * USDC + 206n * FAUCET_USDC_AMOUNT);
    // Another account's stays a new account's.
    expect(await ledger.usdcBalance("0x5f2")).toBe(100n * USDC);
  });

  it("a pack is paid from the ledger's USDC; short, it is refused until the faucet mints more", async () => {
    const ledger = ledgerOn();
    const writes = ledger.writesFor("0x5f1");
    const buy = () => writes.buyPack({ packId: 3, confirmedPrice: 40n * USDC, confirmedMinOut: 1n, referrer: null });
    await buy();
    await buy();
    expect(await ledger.usdcBalance("0x5f1")).toBe(20n * USDC);
    await expect(buy()).rejects.toThrow(/get test USDC first/);
    expect(await ledger.usdcBalance("0x5f1")).toBe(20n * USDC);
    await writes.mint();
    await buy();
    expect(await ledger.usdcBalance("0x5f1")).toBe(80n * USDC);
  });

  it("PAVED and vPAVED move together at the Vault, in the ledger alone", async () => {
    const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0, starting: { usdc: 0n, paved: 50n * P } });
    const writes = ledger.writesFor("0x5f1");
    await writes.deposit(20n * P, { confirmedAmount: 20n * P });
    const { shares, maxWithdraw } = await ledger.vault("0x5f1");
    expect(shares).toBeGreaterThan(0n);
    expect(await ledger.pavedBalance("0x5f1")).toBe(30n * P);
    await writes.withdrawAll({ confirmedShares: shares });
    expect(await ledger.pavedBalance("0x5f1")).toBe(30n * P + maxWithdraw);
    expect((await ledger.vault("0x5f1")).shares).toBe(0n);
  });

  it("reads a state saved before #927 (the moves on top of the chain's balance) as the balances, a negative one as 0", async () => {
    const store = memoryStore();
    const ledger = ledgerOn(store);
    await ledger.writesFor("0x5f1").mint();
    const state = JSON.parse(store.data.get(MOCK_KEY)!);
    const player = Object.values(state.players as Record<string, { usdc: string; paved: string }>)[0]!;
    player.usdc = (-9n * USDC).toString();
    player.paved = (142n * P).toString();
    store.data.set(MOCK_KEY, JSON.stringify(state));
    const reloaded = ledgerOn(store);
    expect(await reloaded.usdcBalance("0x5f1")).toBe(0n);
    expect(await reloaded.pavedBalance("0x5f1")).toBe(142n * P);
    await reloaded.writesFor("0x5f1").mint();
    expect(await reloaded.usdcBalance("0x5f1")).toBe(FAUCET_USDC_AMOUNT);
  });

  it("Reset's forget gives the next account of the key a new account's tokens", async () => {
    const ledger = ledgerOn();
    await ledger.writesFor("0x5f1").mint();
    await ledger.forget("0x5f1");
    expect(await ledger.usdcBalance("0x5f1")).toBe(100n * USDC);
    expect(await ledger.pavedBalance("0x5f1")).toBe(0n);
  });
});

preloadPages("cobbles");

beforeEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
});
afterEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("the balances on the mock, in the app (#927)", () => {
  it("the packs' USDC plate of a new account: 100 USDC with Get test USDC, which mints 100 more", async () => {
    const s = mockImplementation();
    const me = s.sources.signer!.address;
    markWelcomed();
    const wallet = fakeWallet({ address: me, restored: true });
    render(<App router={createTestRouter("/cobbles")} sources={{ ...s.sources, signer: null }} connector={async () => mockConnector(wallet.connector, s.ledger)} />);
    const [usdc] = await screen.findAllByRole("button", { name: "100.00 USDC: Get test USDC" }, WAIT);
    await userEvent.click(usdc!);
    expect((await screen.findAllByRole("button", { name: "200.00 USDC: Get test USDC" }, WAIT)).length).toBeGreaterThan(0);
    expect(await s.ledger.usdcBalance(me)).toBe(200n * USDC);
  }, slow(30_000));
});
