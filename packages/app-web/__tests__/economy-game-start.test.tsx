// @vitest-environment jsdom
// The game page buys a paid Daily (P8) only from the purchase confirm's history state.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FakeGameViews, PavedProvider, resolveDeployment, resolveEconomyDeployment } from "@paved/chain";
import type { PavedClient } from "@paved/chain";
import { FAKE_UNIT, FakeEconomy } from "@paved/chain/economy/fake";
import { GamePage } from "../src/pages/Game";
import { EconomyProvider } from "../src/utils/economy-context";
import { purchaseIntent } from "../src/utils/economy-start";
import { Where } from "./helpers/page-fixtures";

vi.mock("@paved/renderer/react", () => ({ GameCanvas: () => null }));
vi.mock("@paved/ui", () => ({
  IngameStatus: () => null,
  GameCompleteDialog: () => null,
  ActionBar: () => null,
  SpotSelector: () => null,
  useGameStore: () => null,
}));

afterEach(cleanup);

const ADDR = { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" };
const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12", usdc: "0x13" };
const base = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: ADDR } });
const account = { address: "0x5", execute: async () => ({ transaction_hash: "0x0" }) };

function setup(opts: { state?: unknown; search?: string; unit?: bigint; noGameSpawned?: boolean }) {
  const views = new FakeGameViews();
  views.price = { token: ECON.usdc, amount: opts.unit ?? FAKE_UNIT };
  const economy = new FakeEconomy();
  economy.unit = opts.unit ?? FAKE_UNIT;
  const sent: Array<Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>> = [];
  const sendCalls = vi.fn(async (prepare: () => Promise<{ calls: (typeof sent)[number] }>) => {
    const { calls } = await prepare();
    sent.push(calls);
    return { transactionHash: "0x1", events: opts.noGameSpawned ? [] : [{ name: "GameSpawned", fields: { gameId: 9 }, fromAddress: ADDR.Daily }] };
  });
  const spawn = vi.fn(async () => ({ gameId: 1 }));
  const client = { views, events: { playerGames: vi.fn(async () => []) }, writer: () => ({ address: account.address, sendCalls, spawn }) } as unknown as PavedClient;
  render(
    <PavedProvider deployment={base} account={account} client={client}>
      <MemoryRouter initialEntries={[{ pathname: "/game", search: opts.search ?? "?mode=daily", state: opts.state }]}>
        <Where />
        <EconomyProvider value={{ deployment: resolveEconomyDeployment({ base, env: ECON }), views: economy }}>
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
    const { sent, spawn, economy } = setup({ state: purchaseIntent(4, 8_000_000n, "0x77") });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/id=9/));
    expect(sent).toHaveLength(1);
    expect(sent[0].map((c) => [c.contractAddress, c.entrypoint])).toEqual([[ECON.usdc, "approve"], [ADDR.Daily, "spawn"]]);
    expect(sent[0][0].calldata).toEqual([ADDR.Daily, "0x7a1200", "0x0"]);
    const minOut = await economy.expectedMinOut(4);
    expect(sent[0][1].calldata).toEqual(["0x4", "0x77", `0x${minOut.toString(16)}`, "0x0"]);
    expect(spawn).not.toHaveBeenCalled(); // not the free-entry path
  });

  it("a price changed since the confirm sends nothing and says so", async () => {
    const { sent } = setup({ state: purchaseIntent(1, 2_000_000n, null), unit: 3_000_000n });
    expect(await screen.findByText("Cannot start a game: The price changed: confirm again")).toBeTruthy();
    expect(sent).toHaveLength(0);
    expect(screen.getByTestId("where").textContent).toMatch(/\|null$/);
  });

  it("a receipt without GameSpawned: 'sent, outcome unknown' with the hash, no retry, never 'Cannot start'", async () => {
    const { sendCalls } = setup({ state: purchaseIntent(1, 2_000_000n, null), noGameSpawned: true });
    expect(await screen.findByText("Purchase sent (0x1), outcome unknown: check your games before buying again")).toBeTruthy();
    expect(screen.queryByText(/Cannot start a game/)).toBeNull();
    expect(screen.queryByText(/buy|retry/i, { selector: "button" })).toBeNull();
    expect(sendCalls).toHaveBeenCalledTimes(1);
    // The consent is gone: nothing can buy again without a new confirm.
    expect(screen.getByTestId("where").textContent).toMatch(/\|null$/);
  });

  it("a URL alone buys nothing", async () => {
    const { sendCalls, spawn } = setup({ state: null, search: "?mode=daily&stake=3&price=6000000&ref=0x77" });
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
