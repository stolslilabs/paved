// @vitest-environment jsdom
// The game page buys a paid Challenge (P8) only from the purchase confirm's history state.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CHAIN_MISMATCH, FakeGameViews, MAINNET_ROUTER, RATE_UNAVAILABLE, POOL_CANNOT_FILL, ROUTER_NOT_PINNED, POOL_QUOTE_UNAVAILABLE, PavedProvider, PurchaseOutcomeUnknownError, WriteError, resolveDeployment, resolveEconomyDeployment } from "@paved/chain";
import type { PavedClient } from "@paved/chain";
import { FAKE_CHAIN_ID, FAKE_ROUTER_FILE, FAKE_UNIT, FakeEconomy, FakePoolQuoter } from "@paved/chain/testing";
import { GamePage } from "../src/pages/Game";
import { EconomyProvider } from "../src/utils/economy-context";
import { purchaseIntent } from "../src/utils/economy-start";
import { referrerFromSearch } from "../src/utils/economy-view";
import { Where } from "./helpers/page-fixtures";

vi.mock("@paved/renderer/react", () => ({ GameCanvas: () => null }));
vi.mock("@paved/ui", () => ({
  IngameStatus: () => null,
  GameCompleteDialog: () => null,
  ActionBar: () => null,
  useGameStore: () => null,
}));

afterEach(cleanup);

const ADDR = { Challenge: "0x2", Setup: "0x3", Token: "0x4" };
const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12", usdc: "0x13" };
const base = { ...resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: ADDR } }), chainId: FAKE_CHAIN_ID };
const SN_MAIN = "0x534e5f4d41494e";
const account = { address: "0x5", execute: async () => ({ transaction_hash: "0x0" }) };

function setup(opts: { state?: unknown; search?: string; unit?: bigint; noGameSpawned?: boolean; sendError?: WriteError; pool?: FakePoolQuoter; router?: string; rate?: bigint; network?: string; rpcChainId?: string }) {
  const views = new FakeGameViews();
  views.price = { token: ECON.usdc, amount: opts.unit ?? FAKE_UNIT };
  const economy = new FakeEconomy();
  economy.unit = opts.unit ?? FAKE_UNIT;
  if (opts.router) economy.router_ = opts.router;
  if (opts.rate !== undefined) economy.guardRate_ = opts.rate;
  const sent: Array<Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>> = [];
  const sendCalls = vi.fn(async (prepare: () => Promise<{ calls: (typeof sent)[number] }>) => {
    const { calls } = await prepare();
    sent.push(calls);
    if (opts.sendError) throw opts.sendError;
    return { transactionHash: "0x1", events: opts.noGameSpawned ? [] : [{ name: "GameSpawned", fields: { gameId: 9 }, fromAddress: ADDR.Challenge }] };
  });
  const spawn = vi.fn(async () => ({ gameId: 1 }));
  const client = { views, events: { playerGames: vi.fn(async () => []) }, writer: () => ({ address: account.address, sendCalls, spawn }), provider: { getChainId: async () => opts.rpcChainId ?? FAKE_CHAIN_ID } } as unknown as PavedClient;
  render(
    <PavedProvider deployment={base} account={account} client={client}>
      <MemoryRouter initialEntries={[{ pathname: "/game", search: opts.search ?? "?mode=challenge", state: opts.state }]}>
        <Where />
        <EconomyProvider value={{ deployment: resolveEconomyDeployment({ base: opts.network ? { ...base, network: opts.network, chainId: SN_MAIN } : base, file: FAKE_ROUTER_FILE, env: ECON }), views: economy, poolQuoter: opts.pool ?? new FakePoolQuoter() }}>
          <Routes>
            <Route path="/game" element={<GamePage />} />
          </Routes>
        </EconomyProvider>
      </MemoryRouter>
    </PavedProvider>,
  );
  return { sent, sendCalls, spawn, economy };
}

describe("GamePage purchase", () => {
  it("clears the consent, then sends approve USDC + spawn(stake, referrer, min_out) of the confirmed price, and opens the game", async () => {
    const { sent, spawn, economy } = setup({ state: purchaseIntent(4, 8_000_000n, "0x77", await new FakeEconomy().expectedMinOut(4)) });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/id=9/));
    expect(sent).toHaveLength(1);
    expect(sent[0].map((c) => [c.contractAddress, c.entrypoint])).toEqual([[ECON.usdc, "approve"], [ADDR.Challenge, "spawn"]]);
    expect(sent[0][0].calldata).toEqual([ADDR.Challenge, "0x7a1200", "0x0"]);
    const minOut = await economy.expectedMinOut(4);
    expect(sent[0][1].calldata).toEqual(["0x4", "0x77", `0x${minOut.toString(16)}`, "0x0"]);
    expect(spawn).not.toHaveBeenCalled(); // not the free-entry path
  });

  it("a price changed since the confirm sends nothing and says so", async () => {
    const { sent } = setup({ state: purchaseIntent(1, 2_000_000n, null, 1n), unit: 3_000_000n });
    expect(await screen.findByText("Cannot start a game: The price changed: confirm again")).toBeTruthy();
    expect(sent).toHaveLength(0);
    expect(screen.getByTestId("where").textContent).toMatch(/\|null$/);
  });

  it("a receipt without GameSpawned: 'sent, outcome unknown' with the hash, no retry, never 'Cannot start'", async () => {
    const { sendCalls } = setup({ state: purchaseIntent(1, 2_000_000n, null, 1n), noGameSpawned: true });
    expect(await screen.findByText("Purchase sent (0x1), outcome unknown: check your games before buying again")).toBeTruthy();
    expect(screen.queryByText(/Cannot start a game/)).toBeNull();
    expect(screen.queryByText(/buy|retry/i, { selector: "button" })).toBeNull();
    expect(sendCalls).toHaveBeenCalledTimes(1);
    // The consent is gone: nothing can buy again without a new confirm.
    expect(screen.getByTestId("where").textContent).toMatch(/\|null$/);
  });

  it("sent, then the receipt could not be read: 'sent, outcome unknown', like the empty receipt", async () => {
    const { sendCalls } = setup({ state: purchaseIntent(1, 2_000_000n, null, 1n), sendError: new WriteError("socket hang up", "0xab") });
    expect(await screen.findByText("Purchase sent (0xab), outcome unknown: check your games before buying again")).toBeTruthy();
    expect(screen.queryByText(/Cannot start a game/)).toBeNull();
    expect(sendCalls).toHaveBeenCalledTimes(1);
  });

  it("an outcome-unknown error is told apart from its parent WriteError: the no-retry screen, not a failure", async () => {
    // PurchaseOutcomeUnknownError extends WriteError: the page tests it first.
    const unknown = new PurchaseOutcomeUnknownError("0xcd");
    expect(unknown).toBeInstanceOf(WriteError);
    setup({ state: purchaseIntent(1, 2_000_000n, null, 1n), sendError: unknown });
    expect(await screen.findByText("Purchase sent (0xcd), outcome unknown: check your games before buying again")).toBeTruthy();
    expect(screen.queryByText(/Cannot start a game/)).toBeNull();
  });

  it("a reverted purchase is a known failure: 'Cannot start a game' with its reason", async () => {
    setup({ state: purchaseIntent(1, 2_000_000n, null, 1n), sendError: new WriteError("Economy: slippage", "0xab", true) });
    expect(await screen.findByText("Cannot start a game: Economy: slippage")).toBeTruthy();
    expect(screen.queryByText(/outcome unknown/)).toBeNull();
  });

  it("a quote_swap that reverts at send (the pool cannot fill): the plain message, nothing sent", async () => {
    const pool = new FakePoolQuoter();
    pool.fail = "Economy: partial fill";
    const { sent } = setup({ state: purchaseIntent(10, 20_000_000n, null, 1n), pool });
    expect(await screen.findByText(`Cannot start a game: ${POOL_CANNOT_FILL} Nothing was sent.`)).toBeTruthy();
    expect(screen.queryByText(/partial fill/)).toBeNull();
    expect(pool.calls).toHaveLength(1);
    expect(sent).toHaveLength(0);
    expect(screen.getByTestId("where").textContent).toMatch(/\|null$/);
  });

  it("a pool that moved down since the confirm (a fresh min_out below the confirmed one): nothing sent, confirm again", async () => {
    const confirmed = await new FakeEconomy().expectedMinOut(2);
    const pool = new FakePoolQuoter();
    pool.rate = { paved: 79n * 10n ** 18n, usdc: 1_000_000n };
    const { sent } = setup({ state: purchaseIntent(2, 4_000_000n, null, confirmed), pool });
    expect(await screen.findByText("Cannot start a game: The pool price moved: confirm again")).toBeTruthy();
    expect(pool.calls).toHaveLength(1);
    expect(sent).toHaveLength(0);
    expect(screen.getByTestId("where").textContent).toMatch(/\|null$/);
  });

  it("a 'confirm again' refusal offers the way straight back to the purchase screen", async () => {
    const confirmed = await new FakeEconomy().expectedMinOut(2);
    const pool = new FakePoolQuoter();
    pool.rate = { paved: 79n * 10n ** 18n, usdc: 1_000_000n };
    setup({ state: purchaseIntent(2, 4_000_000n, null, confirmed), pool });
    fireEvent.click(await screen.findByText("Back to purchase"));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/^\/economy\|/));
  });

  it("a quote below 90 % of the guard-rate value at send, not accepted at the confirm: nothing sent, confirm again", async () => {
    const pool = new FakePoolQuoter();
    pool.rate = { paved: 70n * 10n ** 18n, usdc: 1_000_000n };
    const { sent } = setup({ state: purchaseIntent(1, 2_000_000n, null, 1n), pool });
    expect(await screen.findByText("Cannot start a game: The pool quote is far below the guard rate: confirm again")).toBeTruthy();
    expect(screen.getByText("Back to purchase")).toBeTruthy();
    expect(sent).toHaveLength(0);
  });

  it("the same quote, accepted at the confirm: sent", async () => {
    const pool = new FakePoolQuoter();
    pool.rate = { paved: 70n * 10n ** 18n, usdc: 1_000_000n };
    const { sent } = setup({ state: purchaseIntent(1, 2_000_000n, null, 1n, true), pool });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/id=9/));
    expect(sent).toHaveLength(1);
  });

  it("a router that is not the pinned one at send: the plain message, nothing sent, no way back to buy", async () => {
    const pool = new FakePoolQuoter();
    const { sent } = setup({ state: purchaseIntent(1, 2_000_000n, null, 1n), pool, router: MAINNET_ROUTER });
    expect(await screen.findByText(`Cannot start a game: ${ROUTER_NOT_PINNED} Nothing was sent.`)).toBeTruthy();
    expect(screen.queryByText("Back to purchase")).toBeNull();
    expect(pool.calls).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("'Back to purchase' keeps the purchase's referrer: /economy?ref=<referrer>", async () => {
    const confirmed = await new FakeEconomy().expectedMinOut(2);
    const pool = new FakePoolQuoter();
    pool.rate = { paved: 79n * 10n ** 18n, usdc: 1_000_000n };
    setup({ state: purchaseIntent(2, 4_000_000n, "0x77", confirmed), pool });
    fireEvent.click(await screen.findByText("Back to purchase"));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/^\/economy\?ref=0x77\|/));
    expect(referrerFromSearch(new URLSearchParams("?ref=0x77"))).toBe("0x77");
  });

  it("an RPC on another chain than the deployment's at send: the plain message, nothing sent", async () => {
    const pool = new FakePoolQuoter();
    const { sent } = setup({ state: purchaseIntent(1, 2_000_000n, null, 1n), pool, rpcChainId: SN_MAIN });
    expect(await screen.findByText(`Cannot start a game: ${CHAIN_MISMATCH} Nothing was sent.`)).toBeTruthy();
    expect(pool.calls).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("mainnet, rate 0 (unexpected), at send: refused, the pool not quoted, nothing sent", async () => {
    const pool = new FakePoolQuoter();
    const { sent } = setup({ state: purchaseIntent(1, 2_000_000n, null, 1n), pool, router: MAINNET_ROUTER, rate: 0n, network: "mainnet", rpcChainId: SN_MAIN });
    expect(await screen.findByText(`Cannot start a game: ${RATE_UNAVAILABLE}. Nothing was sent.`)).toBeTruthy();
    expect(pool.calls).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("mainnet at a rate above 0 at send: sent as before", async () => {
    const { sent } = setup({ state: purchaseIntent(1, 2_000_000n, null, 1n), router: MAINNET_ROUTER, network: "mainnet", rpcChainId: SN_MAIN });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/id=9/));
    expect(sent).toHaveLength(1);
  });

  it("an equal or higher fresh quote sends, with min_out at least the confirmed one", async () => {
    const confirmed = await new FakeEconomy().expectedMinOut(2);
    const pool = new FakePoolQuoter();
    pool.rate = { paved: 81n * 10n ** 18n, usdc: 1_000_000n };
    const { sent } = setup({ state: purchaseIntent(2, 4_000_000n, null, confirmed), pool });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/id=9/));
    expect(BigInt(sent[0][1].calldata[2])).toBeGreaterThanOrEqual(confirmed);
  });

  it("a quote that cannot be read at send (not a revert): 'cannot read the pool quote', nothing sent", async () => {
    const pool = new FakePoolQuoter();
    pool.fail = "fetch failed";
    const { sent } = setup({ state: purchaseIntent(1, 2_000_000n, null, 1n), pool });
    expect(await screen.findByText(`Cannot start a game: ${POOL_QUOTE_UNAVAILABLE} Nothing was sent.`)).toBeTruthy();
    expect(sent).toHaveLength(0);
  });

  it("an intent without a confirmed floor buys nothing", async () => {
    const { sendCalls, spawn } = setup({ state: { start: true, purchase: { stake: 1, confirmedPrice: "2000000", referrer: null } } });
    expect(screen.getByText("No game selected")).toBeTruthy();
    expect(sendCalls).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("a URL alone buys nothing", async () => {
    const { sendCalls, spawn } = setup({ state: null, search: "?mode=challenge&stake=3&price=6000000&ref=0x77" });
    expect(screen.getByText("No game selected")).toBeTruthy();
    expect(sendCalls).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("a malformed purchase state buys nothing", async () => {
    const { sendCalls, spawn } = setup({ state: { start: true, purchase: { stake: 3, confirmedPrice: 6_000_000, referrer: null } } });
    expect(screen.getByText("No game selected")).toBeTruthy();
    expect(sendCalls).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
});
