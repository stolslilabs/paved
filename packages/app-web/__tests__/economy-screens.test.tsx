// @vitest-environment jsdom
// The economy screens (P8) on the fake: `docs/architecture/client-economy.md`.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { FakeGameViews, resolveDeployment, resolveEconomyDeployment } from "@paved/chain";
import type { Deployment, EconomyDeployment } from "@paved/chain";
import { FAKE_UNIT, FakeEconomy, fakeTerms } from "@paved/chain/economy/fake";
import { LandingPage } from "../src/pages/Landing";
import { EconomyProvider } from "../src/utils/economy-context";
import { purchaseIntent, readPurchaseIntent } from "../src/utils/economy-start";
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

function land(opts: { search?: string; economy?: FakeEconomy; deployment?: EconomyDeployment; games?: unknown[]; now?: number } = {}) {
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
    writer: writer as never,
    wrap: (routes) => (
      <EconomyProvider value={{ deployment: opts.deployment ?? economyDeployment, views: economy, now: () => opts.now ?? (DAY + 1) * 86400 }}>{routes}</EconomyProvider>
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

  it("a referral link to one's own address is ignored", async () => {
    land({ search: `?ref=${PLAYER}` });
    fireEvent.click(await screen.findByText(/mode daily/));
    await screen.findByText("Referral link: your own address, ignored");
    fireEvent.click(await screen.findByText("Buy for 2 USDC"));
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=daily|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))?.referrer).toBeNull();
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

  it("not deployed (every network today): the old Daily confirm, and the panel says so", async () => {
    land({ deployment: resolveEconomyDeployment({ base }) });
    expect(await screen.findByText(/Not deployed on devnet: Economy address/)).toBeTruthy();
    expect(screen.getByText("Economy contracts on stub ABIs (E2 not merged)")).toBeTruthy();
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

describe("after the day: settle with the cliff stated", () => {
  const game = (gameId: number, over: boolean) => ({ mode: "daily", gameId, startTime: DAY * 86400, tournamentId: DAY, over, score: over ? 4000 : null, countedTournamentId: over ? DAY : null });

  it("lists bought games by state; settle only after a confirm; the reward shown is the chain's", async () => {
    const economy = new FakeEconomy();
    economy.terms_.set(1, fakeTerms({ stake: 2, day: DAY, score: 4000 }));
    economy.terms_.set(2, fakeTerms({ stake: 1, day: DAY - 1, score: 5000, settled: true, reward: 3n * P }));
    economy.terms_.set(3, fakeTerms({ stake: 1, day: DAY - 1, score: 10, settled: true }));
    economy.terms_.set(5, fakeTerms({ stake: 3, day: DAY + 1, recorded: false }));
    economy.terms_.set(6, fakeTerms({ stake: 1, day: DAY - 1, recorded: false }));
    // Game 4 was not bought (stake 0): not listed.
    const { writer } = land({ economy, games: [game(5, false), game(4, true), game(3, true), game(2, true), game(1, true), game(6, false)] });
    expect(await screen.findByText(/Game 1, day 20000, stake 2: score 4000, to settle/)).toBeTruthy();
    expect(screen.getByText(/Game 2, .*settled, score 5000: 3 PAVED/)).toBeTruthy();
    expect(screen.getByText(/Game 3, .*below the shifted mean, the stake is lost/)).toBeTruthy();
    expect(screen.getByText(/Game 5, .*day running/)).toBeTruthy();
    expect(screen.getByText(/Game 6, .*not finished: it cannot be settled, the stake is lost/)).toBeTruthy();
    expect(screen.queryByText(/Game 4,/)).toBeNull();
    expect(screen.getAllByText(CLIFF_TEXT).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Settle"));
    expect(writer.sendCalls).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Confirm settle"));
    await waitFor(() => expect(writer.sent).toHaveLength(1));
    expect(writer.sent[0]).toEqual([{ contractAddress: ECON.economy, entrypoint: "settle", calldata: ["0x1", "0x1"] }]);
  });
});

describe("helpers", () => {
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
    expect(referralLink("https://paved.gg", "0x00abc")).toBe("https://paved.gg/?ref=0xabc");
  });

  it("settle state from the chain's terms", () => {
    const terms = fakeTerms({ day: DAY });
    expect(settleState(terms, (DAY + 1) * 86400 - 1).kind).toBe("running");
    expect(settleState({ ...terms, recorded: false }, (DAY + 1) * 86400).kind).toBe("not-over");
    expect(settleState(terms, (DAY + 1) * 86400).kind).toBe("settleable");
    expect(settleState({ ...terms, settled: true, reward: 5n }, 0)).toEqual({ kind: "settled", reward: 5n });
  });

  it("the economy's addresses come from the same network's file, the env first", () => {
    const files = { "/x/devnet.json": { default: { contracts: { Economy: { address: "0x20" }, PavedToken: { address: "0x21" }, Vault: { address: "0x22" }, MockUSDC: { address: "0x23" } } } } };
    expect(resolveEconomyNetwork(base, {}, files).configured).toBe(true);
    expect(resolveEconomyNetwork(base, { VITE_USDC_ADDRESS: "0x99" }, files).addresses.USDC).toBe("0x99");
    expect(resolveEconomyNetwork(base, {}, {}).configured).toBe(false);
  });
});
