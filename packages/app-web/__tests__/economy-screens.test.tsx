// @vitest-environment jsdom
// The economy screens (P8) on the fake: `docs/architecture/client-economy.md`.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { FakeGameViews, resolveDeployment, resolveEconomyDeployment, settlesAfter } from "@paved/chain";
import type { Deployment, EconomyDeployment } from "@paved/chain";
import { FAKE_UNIT, FakeEconomy, FakePoolQuoter, fakeTerms } from "@paved/chain/testing";
import { EconomyPage } from "../src/pages/Economy";
import { LandingPage } from "../src/pages/Landing";
import { EconomyProvider } from "../src/utils/economy-context";
import { purchaseIntent, readPurchaseIntent, spawnForIntent } from "../src/utils/economy-start";
import { CLIFF_TEXT, referralLink, referrerFromSearch, settleState } from "../src/utils/economy-view";
import { resolveEconomyNetwork } from "../src/utils/economy-network";
import { PLAYER, renderPage } from "./helpers/page-fixtures";

vi.mock("@paved/ui", () => ({
  LandingScreen: ({ gameModes }: any) => (
    <div>
      {gameModes.map((m: any) => (
        <button key={m.mode} type="button" onClick={m.onPress}>
          {`mode ${m.mode}: ${m.entryFee}`}
        </button>
      ))}
    </div>
  ),
  ModeDetailDialog: ({ children }: any) => <div>{children}</div>,
  ModeDetailDialogStat: ({ children }: any) => <div>{children}</div>,
  TokenPanel: ({ error }: any) => <div>{error && <div role="alert">{error}</div>}</div>,
}));

afterEach(cleanup);

const ADDR = { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" };
const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12", usdc: "0x13" };
const REFERRER = "0x77";
const DAY = 20_000;
const P = 10n ** 18n;
const base = { ...resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: ADDR } }), tokenDecimals: 18 } as Deployment;
const economyDeployment = resolveEconomyDeployment({ base, env: ECON });

/** A base writer that runs the economy's `prepare` (its reads and checks) and records the calls it would send. */
function fakeBaseWriter() {
  const sent: Array<Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>> = [];
  const sendCalls = vi.fn(async (prepare: () => Promise<{ calls: (typeof sent)[number] }>) => {
    const { calls } = await prepare();
    sent.push(calls);
    return { transactionHash: "0x1", events: [{ name: "GameSpawned", fields: { gameId: 9 }, fromAddress: ADDR.Daily }] };
  });
  return { address: PLAYER, sendCalls, sent };
}

function land(opts: { search?: string; economy?: FakeEconomy; deployment?: EconomyDeployment; games?: unknown[]; now?: number; pool?: FakePoolQuoter | null | "network"; playerFor?: (address: string) => Promise<{ id: string; name: string; master: string } | null> } = {}) {
  const economy = opts.economy ?? new FakeEconomy();
  const views = new FakeGameViews();
  views.price = { token: ECON.usdc, amount: FAKE_UNIT };
  const writer = fakeBaseWriter();
  const utils = renderPage({
    page: <LandingPage />,
    path: "/",
    search: opts.search,
    deployment: base,
    views,
    games: opts.games,
    playerFor: opts.playerFor,
    writer: writer as never,
    wrap: (routes) => (
      <EconomyProvider value={{ deployment: opts.deployment ?? economyDeployment, views: economy, poolQuoter: opts.pool === "network" ? undefined : opts.pool === undefined ? new FakePoolQuoter() : opts.pool, now: () => opts.now ?? settlesAfter(DAY) }}>{routes}</EconomyProvider>
    ),
  });
  return { ...utils, economy, writer };
}

const where = () => screen.getByTestId("where").textContent ?? "";

describe("purchase: the stake picker, then an explicit confirm", () => {
  it("shows P = 2k USDC from the chain and the boost; one click only asks, Confirm carries the price in history state", async () => {
    const { writer } = land();
    fireEvent.click(await screen.findByText("mode daily: USDC, by stake"));
    expect(await screen.findByText("Price: 2 USDC")).toBeTruthy();
    expect(screen.getByText("Reward boost: x1.01")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "7" }));
    expect(await screen.findByText("Price: 14 USDC")).toBeTruthy();
    expect(screen.getByText("Reward boost: x1.07")).toBeTruthy();
    fireEvent.click(screen.getByText("Buy for 14 USDC"));
    // Nothing moved: the first click only shows the amount.
    expect(where()).toMatch(/^\/\|/);
    expect(screen.getByRole("dialog", { name: "Confirm purchase" }).textContent).toContain("Pay 14 USDC");
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=daily|"));
    // The consent is the history state; the URL carries only the mode.
    expect(where().split("|")[0]).toBe("/game?mode=daily");
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))).toEqual({ stake: 7, confirmedPrice: 14_000_000n, referrer: null });
    expect(writer.sendCalls).not.toHaveBeenCalled();
  });

  it("the cliff text shows at the picker and at the confirm", async () => {
    land();
    fireEvent.click(await screen.findByText(/mode daily/));
    await screen.findByText("Price: 2 USDC");
    expect(screen.getAllByText(CLIFF_TEXT, { exact: false }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Buy for 2 USDC"));
    expect(screen.getByRole("dialog", { name: "Confirm purchase" }).textContent).toContain(CLIFF_TEXT);
  });

  it("a referrer from the link is shown at the confirm and changes no amount the player pays", async () => {
    land({ search: `?ref=${REFERRER}` });
    fireEvent.click(await screen.findByText(/mode daily/));
    fireEvent.click(screen.getByRole("radio", { name: "10" }));
    expect(await screen.findByText("Price: 20 USDC")).toBeTruthy();
    await screen.findByText("Referrer: 0x77");
    fireEvent.click(screen.getByText("Buy for 20 USDC"));
    const dialog = screen.getByRole("dialog", { name: "Confirm purchase" }).textContent ?? "";
    expect(dialog).toContain("Pay 20 USDC");
    expect(dialog).toContain("gets 1 USDC out of the stakers' margin: you pay the same 20 USDC");
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=daily|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))).toEqual({ stake: 10, confirmedPrice: 20_000_000n, referrer: REFERRER });
  });

  it("a malformed referrer in the link (?ref=abc) is ignored: no referrer shown or sent", async () => {
    land({ search: "?ref=abc" });
    fireEvent.click(await screen.findByText(/mode daily/));
    fireEvent.click(await screen.findByText("Buy for 2 USDC"));
    expect(screen.queryByText(/Referrer/)).toBeNull();
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=daily|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))?.referrer).toBeNull();
  });

  it("a referrer that is not a registered player is shown as ignored and is not sent", async () => {
    land({ search: `?ref=${REFERRER}`, playerFor: async (address) => (BigInt(address) === BigInt(REFERRER) ? null : { id: PLAYER, name: "Zed", master: PLAYER }) });
    fireEvent.click(await screen.findByText(/mode daily/));
    await screen.findByText("Referrer 0x77 is not a registered player: ignored");
    fireEvent.click(await screen.findByText("Buy for 2 USDC"));
    expect(screen.getByRole("dialog", { name: "Confirm purchase" }).textContent).not.toContain("gets");
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=daily|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))?.referrer).toBeNull();
  });

  it("a referrer still loading holds the purchase back; it is offered once the answer is in", async () => {
    let answer!: (player: { id: string; name: string; master: string } | null) => void;
    const pending = new Promise<{ id: string; name: string; master: string } | null>((resolve) => (answer = resolve));
    land({ search: `?ref=${REFERRER}`, playerFor: (address) => (BigInt(address) === BigInt(REFERRER) ? pending : Promise.resolve({ id: PLAYER, name: "Zed", master: PLAYER })) });
    fireEvent.click(await screen.findByText(/mode daily/));
    await screen.findByText("Price: 2 USDC");
    // The price is known, the referrer is not: nothing can be confirmed yet, so the referrer cannot be dropped silently.
    expect((screen.getByText("Buy for 2 USDC", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
    answer({ id: REFERRER, name: "Ref", master: REFERRER });
    await waitFor(() => expect((screen.getByText("Buy for 2 USDC", { selector: "button" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText("Referrer: 0x77")).toBeTruthy();
    fireEvent.click(screen.getByText("Buy for 2 USDC"));
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=daily|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))?.referrer).toBe(REFERRER);
  });

  it("a ?ref= out of the address range (at or above 2^251 - 256, up to the felt prime and beyond) is no referrer", async () => {
    land({ search: `?ref=0x${((1n << 251n) - 256n).toString(16)}` });
    fireEvent.click(await screen.findByText(/mode daily/));
    fireEvent.click(await screen.findByText("Buy for 2 USDC"));
    expect(screen.queryByText(/Referrer/)).toBeNull();
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=daily|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))?.referrer).toBeNull();
  });

  it("a referral link to one's own address is ignored", async () => {
    land({ search: `?ref=${PLAYER}` });
    fireEvent.click(await screen.findByText(/mode daily/));
    await screen.findByText("Referral link: your own address, ignored");
    fireEvent.click(await screen.findByText("Buy for 2 USDC"));
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=daily|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))?.referrer).toBeNull();
  });

  it("no pool quote (a missing quoter): the purchase is not offered", async () => {
    land({ pool: null });
    fireEvent.click(await screen.findByText(/mode daily/));
    expect(await screen.findByText("No pool quote: purchase unavailable")).toBeTruthy();
    expect((screen.getByText("No pool quote", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the network's quoter (none overridden): offered on mainnet (Ekubo's quoter), not on an unknown network", async () => {
    const on = (network: string) => resolveEconomyDeployment({ base: { ...base, network }, env: ECON });
    land({ pool: "network", deployment: on("mainnet") });
    fireEvent.click(await screen.findByText(/mode daily/));
    expect(await screen.findByText("Buy for 2 USDC")).toBeTruthy();
    cleanup();
    land({ pool: "network", deployment: on("katana") });
    fireEvent.click(await screen.findByText(/mode daily/));
    expect(await screen.findByText("No pool quote: purchase unavailable")).toBeTruthy();
  });

  it("shows the slippage, the 24 h expiry and the current reference, never a day mean or projected reward", async () => {
    const economy = new FakeEconomy();
    economy.days.set(DAY, { prior: 3_353_000, sum: 0n, weight: 0, mean: 0, closed: false });
    land({ economy });
    fireEvent.click(await screen.findByText(/mode daily/));
    expect(await screen.findByText("Slippage on the burn swap: 1 % (at most 5 %)")).toBeTruthy();
    expect(screen.getByText("A paid game expires 24 h after its purchase; an expired game gets no reward.")).toBeTruthy();
    expect(
      screen.getAllByText("Current reference: mean 3353 points, threshold 3353 points; the day's own mean is known only at settlement.").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/mean 0 points/)).toBeNull();
    expect(screen.queryByText(/projected|estimated|expected reward/i)).toBeNull();
  });

  it("a failed read disables the purchase", async () => {
    const economy = new FakeEconomy();
    economy.fail = "node down";
    land({ economy });
    fireEvent.click(await screen.findByText(/mode daily/));
    expect(await screen.findByText(/Price unavailable: node down/)).toBeTruthy();
    expect((screen.getByText("Price unavailable", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a quote that disagrees with the entry price disables the purchase", async () => {
    const economy = new FakeEconomy();
    economy.unit = 3_000_000n;
    land({ economy });
    fireEvent.click(await screen.findByText(/mode daily/));
    expect(await screen.findByText(/the quote disagrees/)).toBeTruthy();
  });

  it("not deployed (a network without the economy addresses): the panel says so", async () => {
    land({ deployment: resolveEconomyDeployment({ base }) });
    expect(await screen.findByText(/Not deployed on devnet: Economy address/)).toBeTruthy();
    expect(screen.queryByText(/USDC, by stake/)).toBeNull();
  });
});

describe("Vault: stake, unstake, dividends, each after a confirm", () => {
  it("stake sends approve + stake of exactly the confirmed amount, only after Confirm", async () => {
    const economy = new FakeEconomy();
    economy.setBalance("paved", PLAYER, 5n * P);
    economy.setVault(PLAYER, { staked: P, pending: 2_500_000n });
    const { writer } = land({ economy });
    expect(await screen.findByText("Dividends: 2.5 USDC")).toBeTruthy();
    expect(screen.getByText("Staked: 1 PAVED of 0 PAVED")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Vault amount"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByText("Stake"));
    expect(writer.sendCalls).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Confirm" }).textContent).toContain("Stake 1.5 PAVED in the Vault?");
    fireEvent.click(screen.getByText("Unstake"));
    expect(screen.getByRole("dialog", { name: "Confirm" }).textContent).toContain("Unstake 1.5 PAVED from the Vault? Your dividends stay claimable.");
    fireEvent.click(screen.getByText("Stake"));
    fireEvent.click(screen.getByText("Confirm stake"));
    await waitFor(() => expect(writer.sent).toHaveLength(1));
    expect(writer.sent[0].map((c) => [c.contractAddress, c.entrypoint])).toEqual([[ECON.pavedToken, "approve"], [ECON.vault, "stake"]]);
    expect(writer.sent[0][1].calldata).toEqual([`0x${(15n * 10n ** 17n).toString(16)}`, "0x0"]);
  });

  it("an amount edited after the first click is refused at send", async () => {
    const economy = new FakeEconomy();
    economy.setBalance("paved", PLAYER, 5n * P);
    const { writer } = land({ economy });
    const field = await screen.findByLabelText("Vault amount");
    fireEvent.change(field, { target: { value: "1" } });
    fireEvent.click(screen.getByText("Stake"));
    fireEvent.change(field, { target: { value: "2" } });
    fireEvent.click(screen.getByText("Confirm stake"));
    expect(await screen.findByText("The amount changed: confirm again")).toBeTruthy();
    expect(writer.sent).toHaveLength(0);
  });

  it("claim dividends shows the amount and sends the confirmed one", async () => {
    const economy = new FakeEconomy();
    economy.setVault(PLAYER, { staked: P, pending: 2_500_000n });
    const { writer } = land({ economy });
    fireEvent.click(await screen.findByText("Claim dividends"));
    expect(screen.getByRole("dialog", { name: "Confirm" }).textContent).toContain("Claim 2.5 USDC of dividends?");
    fireEvent.click(screen.getByText("Confirm claim"));
    await waitFor(() => expect(writer.sent).toHaveLength(1));
    expect(writer.sent[0].map((c) => c.entrypoint)).toEqual(["claim"]);
  });
});

describe("dividends that change between the confirm and the send", () => {
  it("show the new amount and ask for a new confirm, sending nothing until then", async () => {
    const economy = new FakeEconomy();
    economy.setVault(PLAYER, { staked: P, pending: 2_500_000n });
    const { writer } = land({ economy });
    fireEvent.click(await screen.findByText("Claim dividends"));
    expect(screen.getByRole("dialog", { name: "Confirm" }).textContent).toContain("Claim 2.5 USDC of dividends?");
    // A purchase elsewhere pays the Vault meanwhile.
    economy.setVault(PLAYER, { staked: P, pending: 3_000_000n });
    fireEvent.click(screen.getByText("Confirm claim"));
    expect(await screen.findByText("Your dividends changed from 2.5 USDC to 3 USDC: confirm again")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Confirm" }).textContent).toContain("Claim 3 USDC of dividends?");
    expect(writer.sent).toHaveLength(0);
    expect(screen.queryByText("The amount changed: confirm again")).toBeNull();
    fireEvent.click(screen.getByText("Confirm claim"));
    await waitFor(() => expect(writer.sent).toHaveLength(1));
    expect(writer.sent[0].map((c) => c.entrypoint)).toEqual(["claim"]);
  });
});

describe("after the day: settle with the cliff stated", () => {
  const NOW = settlesAfter(DAY);
  const game = (gameId: number, over: boolean, startTime = DAY * 86400) => ({ mode: "daily", gameId, startTime, tournamentId: DAY, over, score: over ? 4000 : null, countedTournamentId: over ? DAY : null });

  it("lists bought games by state; settle only after a confirm; the reward shown is the chain's", async () => {
    const economy = new FakeEconomy();
    economy.terms_.set(1, fakeTerms({ stake: 2, day: DAY, score: 4000 }));
    economy.terms_.set(2, fakeTerms({ stake: 1, day: DAY - 1, score: 5000, settled: true, reward: 3n * P }));
    economy.terms_.set(3, fakeTerms({ stake: 1, day: DAY - 1, score: 10, settled: true }));
    economy.terms_.set(5, fakeTerms({ stake: 3, day: DAY + 1, time: NOW - 3600, recorded: false }));
    economy.terms_.set(8, fakeTerms({ stake: 1, day: DAY, score: 700, expired: true }));
    economy.terms_.set(6, fakeTerms({ stake: 1, day: DAY - 1, recorded: false }));
    economy.terms_.set(7, fakeTerms({ stake: 1, day: DAY + 1, score: 900 }));
    // Game 4 was not bought (stake 0): not listed.
    const { writer } = land({
      economy,
      now: NOW,
      games: [game(7, true, NOW - 600), game(5, false, NOW - 3600), game(8, true), game(4, true), game(3, true), game(2, true), game(1, true), game(6, false)],
    });
    expect(await screen.findByText(/Game 1, day 20000, stake 2: score 4000, to settle/)).toBeTruthy();
    expect(screen.getByText(/Game 2, .*settled, score 5000: 3 PAVED/)).toBeTruthy();
    expect(screen.getByText(/Game 3, .*below the shifted mean, the stake is lost/)).toBeTruthy();
    // Bought an hour ago, not over: its expiry, 24 h after the purchase.
    expect(screen.getByText(`Game 5, day ${DAY + 1}, stake 3: in play, expires 2024-10-06 23:00 UTC`)).toBeTruthy();
    // Not recorded 24 h after its purchase: expired.
    expect(screen.getByText(/Game 6, .*: Expired: no reward/)).toBeTruthy();
    // Recorded after its 24 h (terms().expired): no reward, and nothing to settle.
    expect(screen.getByText(/Game 8, .*: Expired: no reward/)).toBeTruthy();
    // Day D+1 settles after D+2 ends: no Settle button for it.
    expect(screen.getByText(`Game 7, day ${DAY + 1}, stake 1: score 900, settles after 2024-10-07 00:00 UTC`)).toBeTruthy();
    expect(screen.getAllByText("Settle")).toHaveLength(1);
    expect(screen.queryByText(/Game 4,/)).toBeNull();
    expect(screen.getAllByText(CLIFF_TEXT).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Settle"));
    expect(writer.sendCalls).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Confirm settle"));
    await waitFor(() => expect(writer.sent).toHaveLength(1));
    expect(writer.sent[0]).toEqual([{ contractAddress: ECON.economy, entrypoint: "settle", calldata: ["0x1", "0x1"] }]);
  });
});

describe("the economy page (/economy)", () => {
  const visit = (opts: { deployment?: EconomyDeployment; economy?: FakeEconomy } = {}) => {
    const economy = opts.economy ?? new FakeEconomy();
    const views = new FakeGameViews();
    views.price = { token: ECON.usdc, amount: FAKE_UNIT };
    const writer = fakeBaseWriter();
    renderPage({
      page: <EconomyPage />,
      path: "/economy",
      search: `?ref=${REFERRER}`,
      deployment: base,
      views,
      writer: writer as never,
      wrap: (routes) => (
        <EconomyProvider value={{ deployment: opts.deployment ?? economyDeployment, views: economy, poolQuoter: new FakePoolQuoter(), now: () => settlesAfter(DAY) }}>{routes}</EconomyProvider>
      ),
    });
    return { economy, writer };
  };

  it("shows the purchase, the Vault, the after-the-day list and the referral link together", async () => {
    visit();
    expect(await screen.findByText("Price: 2 USDC")).toBeTruthy();
    expect(screen.getByLabelText("Purchase")).toBeTruthy();
    expect(screen.getByLabelText("Vault amount")).toBeTruthy();
    expect(screen.getByLabelText("After the day")).toBeTruthy();
    expect(screen.getByLabelText("Referral")).toBeTruthy();
  });

  it("the purchase confirm carries the price in history state to the game page, as from the Landing", async () => {
    const { writer } = visit();
    fireEvent.click(await screen.findByText("Buy for 2 USDC"));
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=daily|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))).toEqual({ stake: 1, confirmedPrice: 2_000_000n, referrer: REFERRER });
    expect(writer.sendCalls).not.toHaveBeenCalled();
  });

  it("not deployed: it says so and reads nothing", async () => {
    visit({ deployment: resolveEconomyDeployment({ base }) });
    expect(await screen.findByText(/Not deployed on devnet: Economy address/)).toBeTruthy();
    expect(screen.queryByLabelText("Purchase")).toBeNull();
  });

  it("the Landing keeps its entry point to the page", async () => {
    land();
    expect(await screen.findByText("Open the economy page")).toBeTruthy();
  });
});

describe("helpers", () => {
  it("a purchase never falls back to the plain spawn: without the economy writer it throws and sends nothing", async () => {
    const plain = vi.fn(async () => ({ gameId: 1 }));
    const purchase = { stake: 2, confirmedPrice: 4_000_000n, referrer: null };
    await expect(spawnForIntent(purchase, null, plain)).rejects.toThrow("The economy is not available: nothing was sent");
    expect(plain).not.toHaveBeenCalled();
    const bought = vi.fn(async () => ({ gameId: 9 }));
    expect(await spawnForIntent(purchase, { purchase: bought } as never, plain)).toEqual({ gameId: 9 });
    expect(bought).toHaveBeenCalledWith(purchase);
    expect(plain).not.toHaveBeenCalled();
    // No purchase in the intent: the plain spawn, with or without the economy.
    expect(await spawnForIntent(undefined, null, plain)).toEqual({ gameId: 1 });
  });

  it("a purchase intent comes only from state, well formed; a URL alone buys nothing", () => {
    expect(readPurchaseIntent(purchaseIntent(3, 6_000_000n, null))).toEqual({ stake: 3, confirmedPrice: 6_000_000n, referrer: null });
    expect(readPurchaseIntent(null)).toBeNull();
    expect(readPurchaseIntent({ start: true, confirmedAmount: "10" })).toBeNull();
    expect(readPurchaseIntent({ start: true, purchase: { stake: 11, confirmedPrice: "1", referrer: null } })).toBeNull();
    expect(readPurchaseIntent({ start: true, purchase: { stake: 1, confirmedPrice: "0", referrer: null } })).toBeNull();
    expect(readPurchaseIntent({ start: true, purchase: { stake: 1, confirmedPrice: 2_000_000, referrer: null } })).toBeNull();
    expect(readPurchaseIntent({ start: true, purchase: { stake: 1, confirmedPrice: "2000000", referrer: "bob" } })).toBeNull();
  });

  it("referrer and link", () => {
    expect(referrerFromSearch(new URLSearchParams("ref=0x0077"))).toBe("0x77");
    expect(referrerFromSearch(new URLSearchParams("ref=0x0"))).toBeNull();
    expect(referrerFromSearch(new URLSearchParams("ref=abc"))).toBeNull();
    // Below the address bound 2^251 - 256 (itself below the felt prime) only: out of range counts as no referrer.
    const bound = (1n << 251n) - 256n;
    const ref = (v: bigint) => referrerFromSearch(new URLSearchParams(`ref=0x${v.toString(16)}`));
    expect(ref(bound - 1n)).toBe(`0x${(bound - 1n).toString(16)}`);
    for (const v of [bound, 1n << 251n, (1n << 251n) + 17n * (1n << 192n) + 1n, (1n << 256n) - 1n]) expect(ref(v)).toBeNull();
    expect(referralLink("https://paved.gg", "0x00abc")).toBe("https://paved.gg/?ref=0xabc");
  });

  it("settle state: expiry 24 h after the purchase, settlement after the next day ends (P-34)", () => {
    const bought = DAY * 86400 + 100;
    const terms = fakeTerms({ day: DAY, time: bought });
    expect(settleState({ ...terms, recorded: false }, bought, bought + 86_399)).toEqual({ kind: "playing", expiresAt: bought + 86_400 });
    expect(settleState({ ...terms, recorded: false }, bought, bought + 86_400).kind).toBe("expired");
    expect(settleState(terms, bought, (DAY + 2) * 86400 - 1)).toEqual({ kind: "waiting", settlesAfter: (DAY + 2) * 86400 });
    expect(settleState(terms, bought, (DAY + 2) * 86400).kind).toBe("settleable");
    expect(settleState({ ...terms, expired: true }, bought, bought + 10).kind).toBe("expired"); // recorded as expired
    expect(settleState({ ...terms, settled: true, reward: 5n }, bought, 0)).toEqual({ kind: "settled", reward: 5n });
  });

  it("the economy's addresses come from the same network's file, the env first", () => {
    const files = { "/x/devnet.json": { default: { contracts: { Economy: { address: "0x20" }, PavedToken: { address: "0x21" }, Vault: { address: "0x22" }, MockUSDC: { address: "0x23" } } } } };
    expect(resolveEconomyNetwork(base, {}, files).configured).toBe(true);
    expect(resolveEconomyNetwork(base, { VITE_USDC_ADDRESS: "0x99" }, files).addresses.USDC).toBe("0x99");
    expect(resolveEconomyNetwork(base, {}, {}).configured).toBe(false);
  });
});
