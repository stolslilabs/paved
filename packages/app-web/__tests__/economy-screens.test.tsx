// @vitest-environment jsdom
// The economy screens (P8) on the fake: `docs/architecture/client-economy.md`.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { CHAIN_MISMATCH, FakeGameViews, formatUnits, MAINNET_ROUTER, RATE_UNAVAILABLE, POOL_CANNOT_FILL, POOL_QUOTE_UNAVAILABLE, ROUTER_NOT_PINNED, resolveDeployment, resolveEconomyDeployment, settlesAfter } from "@paved/chain";
import type { Deployment, EconomyDeployment } from "@paved/chain";
import { FAKE_CHAIN_ID, FAKE_ROUTER_FILE, FAKE_UNIT, FakeEconomy, FakePoolQuoter, fakeTerms } from "@paved/chain/testing";
import { EconomyPage } from "../src/pages/Economy";
import { LandingPage } from "../src/pages/Landing";
import { EconomyProvider } from "../src/utils/economy-context";
import { purchaseIntent, readPurchaseIntent, spawnForIntent } from "../src/utils/economy-start";
import { CLIFF_TEXT, paved, vpaved, referralLink, referrerFromSearch, settleState } from "../src/utils/economy-view";
import { resolveEconomyNetwork } from "../src/utils/economy-network";
import { PLAYER, fakeGame, renderPage } from "./helpers/page-fixtures";

vi.mock("@paved/ui", () => ({
  LandingScreen: ({ gameModes }: any) => (
    <div>
      {gameModes.map((m: any) => (
        <button key={m.mode} type="button" onClick={m.onPress}>
          {`mode ${m.mode}: ${m.entryFee}`}
          {m.notice && <span data-testid={`notice-${m.mode}`}>{m.notice}</span>}
        </button>
      ))}
    </div>
  ),
  GameModeCardView: () => null,
  ModeDetailDialog: ({ children }: any) => <div>{children}</div>,
  ModeDetailDialogStat: ({ children }: any) => <div>{children}</div>,
  TokenPanel: ({ error }: any) => <div>{error && <div role="alert">{error}</div>}</div>,
}));

afterEach(cleanup);

const ADDR = { Challenge: "0x2", Setup: "0x3", Token: "0x4" };
const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12", usdc: "0x13" };
const REFERRER = "0x77";
const DAY = 20_000;
const P = 10n ** 18n;
const base = { ...resolveDeployment({ network: "devnet", file: FAKE_ROUTER_FILE, env: { rpcUrl: "http://x", addresses: ADDR } }), tokenDecimals: 18, chainId: FAKE_CHAIN_ID } as Deployment;
const economyDeployment = resolveEconomyDeployment({ base, file: FAKE_ROUTER_FILE, env: ECON });

/** A base writer that runs the economy's `prepare` (its reads and checks) and records the calls it would send. */
function fakeBaseWriter() {
  const sent: Array<Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>> = [];
  const sendCalls = vi.fn(async (prepare: () => Promise<{ calls: (typeof sent)[number] }>) => {
    const { calls } = await prepare();
    sent.push(calls);
    return { transactionHash: "0x1", events: [{ name: "GameSpawned", fields: { gameId: 9 }, fromAddress: ADDR.Challenge }] };
  });
  return { address: PLAYER, sendCalls, sent };
}

function land(opts: { search?: string; economy?: FakeEconomy; deployment?: EconomyDeployment; games?: unknown[]; now?: number; pool?: FakePoolQuoter | null | "network"; rpcChainId?: string; rpcChain?: () => string; paused?: boolean | Error } = {}) {
  const economy = opts.economy ?? new FakeEconomy();
  const views = new FakeGameViews();
  views.price = { token: ECON.usdc, amount: FAKE_UNIT };
  if (opts.paused !== undefined) views.paused = opts.paused;
  for (const g of (opts.games ?? []) as Array<{ gameId: number }>) views.setGame({ mode: "challenge", gameId: g.gameId }, fakeGame());
  const writer = fakeBaseWriter();
  const renderOpts = {
    page: <LandingPage />,
    path: "/",
    search: opts.search,
    deployment: base,
    views,
    games: opts.games,
    rpcChainId: opts.rpcChainId,
    writer: writer as never,
    wrap: (routes) => (
      <EconomyProvider value={{ deployment: opts.deployment ?? economyDeployment, views: economy, poolQuoter: opts.pool === "network" ? undefined : opts.pool === undefined ? new FakePoolQuoter() : opts.pool, now: () => opts.now ?? settlesAfter(DAY) }}>{routes}</EconomyProvider>
    ),
  };
  // A chain id read at every call of the fake RPC, which may throw (a transient RPC error).
  if (opts.rpcChain) Object.defineProperty(renderOpts, "rpcChainId", { get: opts.rpcChain });
  const utils = renderPage(renderOpts);
  return { ...utils, economy, writer };
}

const where = () => screen.getByTestId("where").textContent ?? "";

/**
 * The `min_out` the confirm shows for `stake` with the default fakes: the floor the intent carries. With a referrer the
 * referral leaves the one swap (P-56), so the floor is the quote of the price less it.
 */
const floor = (stake: number, referred = false) => new FakeEconomy().expectedMinOut(stake, new FakePoolQuoter(), referred);

/** A purchase button once it is offered: the price, the referrer and the pool's quote are all in. */
async function enabled(text: string): Promise<HTMLButtonElement> {
  const button = (await screen.findByText(text, { selector: "button" })) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  return button;
}

describe("purchase: the stake picker, then an explicit confirm", () => {
  it("shows P = 2k USDC from the chain and the boost; one click only asks, Confirm carries the price in history state", async () => {
    const { writer } = land();
    fireEvent.click(await screen.findByText("mode challenge: USDC, by stake"));
    expect(await screen.findByText("Price: 2 USDC")).toBeTruthy();
    expect(screen.getByText("Reward boost: x1.01")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "7" }));
    expect(await screen.findByText("Price: 14 USDC")).toBeTruthy();
    expect(screen.getByText("Reward boost: x1.07")).toBeTruthy();
    fireEvent.click(await enabled("Buy for 14 USDC"));
    // Nothing moved: the first click only shows the amount.
    expect(where()).toMatch(/^\/\|/);
    expect(screen.getByRole("dialog", { name: "Confirm purchase" }).textContent).toContain("Pay 14 USDC");
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=challenge|"));
    // The consent is the history state; the URL carries only the mode.
    expect(where().split("|")[0]).toBe("/game?mode=challenge");
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))).toEqual({ stake: 7, confirmedPrice: 14_000_000n, referrer: null, confirmedMinOut: await floor(7), acceptedLowQuote: false });
    expect(writer.sendCalls).not.toHaveBeenCalled();
  });

  it("the cliff text shows at the picker and at the confirm", async () => {
    land();
    fireEvent.click(await screen.findByText(/mode challenge/));
    await screen.findByText("Price: 2 USDC");
    expect(screen.getAllByText(CLIFF_TEXT, { exact: false }).length).toBeGreaterThan(0);
    fireEvent.click(await enabled("Buy for 2 USDC"));
    expect(screen.getByRole("dialog", { name: "Confirm purchase" }).textContent).toContain(CLIFF_TEXT);
  });

  it("a referrer from the link is shown at the confirm and changes no amount the player pays", async () => {
    land({ search: `?ref=${REFERRER}` });
    fireEvent.click(await screen.findByText(/mode challenge/));
    fireEvent.click(screen.getByRole("radio", { name: "10" }));
    expect(await screen.findByText("Price: 20 USDC")).toBeTruthy();
    await screen.findByText("Referrer: 0x77");
    fireEvent.click(await enabled("Buy for 20 USDC"));
    const dialog = screen.getByRole("dialog", { name: "Confirm purchase" }).textContent ?? "";
    expect(dialog).toContain("Pay 20 USDC");
    expect(dialog).toContain("gets 1 USDC out of the stakers' margin: you pay the same 20 USDC");
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=challenge|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))).toEqual({ stake: 10, confirmedPrice: 20_000_000n, referrer: REFERRER, confirmedMinOut: await floor(10, true), acceptedLowQuote: false });
  });

  it("a malformed referrer in the link (?ref=abc) is ignored: no referrer shown or sent", async () => {
    land({ search: "?ref=abc" });
    fireEvent.click(await screen.findByText(/mode challenge/));
    fireEvent.click(await enabled("Buy for 2 USDC"));
    expect(screen.queryByText(/Referrer/)).toBeNull();
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=challenge|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))?.referrer).toBeNull();
  });

  // D-25 (E): a referrer is any non-zero address other than the payer, with no registration to read.
  it("a referrer nobody registered is offered at once and sent: no read holds the purchase back", async () => {
    land({ search: `?ref=${REFERRER}` });
    fireEvent.click(await screen.findByText(/mode challenge/));
    await screen.findByText("Referrer: 0x77");
    fireEvent.click(await enabled("Buy for 2 USDC"));
    expect(screen.getByRole("dialog", { name: "Confirm purchase" }).textContent).toContain("gets");
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=challenge|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))?.referrer).toBe(REFERRER);
  });

  it("a ?ref= out of the address range (at or above 2^251 - 256, up to the felt prime and beyond) is no referrer", async () => {
    land({ search: `?ref=0x${((1n << 251n) - 256n).toString(16)}` });
    fireEvent.click(await screen.findByText(/mode challenge/));
    fireEvent.click(await enabled("Buy for 2 USDC"));
    expect(screen.queryByText(/Referrer/)).toBeNull();
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=challenge|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))?.referrer).toBeNull();
  });

  // D-25 (E): the payer's own address, the Challenge and the Economy are refused, with one plain message, and none is sent.
  it.each([
    ["one's own address", PLAYER],
    ["the Challenge contract", ADDR.Challenge],
    ["the Economy contract", ECON.economy],
  ])("a referral link to %s is refused with a message, and no referrer is sent", async (_what, address) => {
    land({ search: `?ref=${address}` });
    fireEvent.click(await screen.findByText(/mode challenge/));
    await screen.findByText("Referral link: this address cannot be your referrer, so no referrer is sent");
    fireEvent.click(await enabled("Buy for 2 USDC"));
    expect(screen.getByRole("dialog", { name: "Confirm purchase" }).textContent).not.toContain("gets");
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=challenge|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))?.referrer).toBeNull();
  });

  it("no pool quote (a missing quoter): the purchase is not offered", async () => {
    land({ pool: null });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText("No pool quote: purchase unavailable")).toBeTruthy();
    expect((screen.getByText("No pool quote", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the deployment's quoter (none overridden) on mainnet and sepolia is Economy.quote_swap: no request to any quoter API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const on = (network: string) => resolveEconomyDeployment({ base: { ...base, network }, file: FAKE_ROUTER_FILE, env: ECON });
    for (const network of ["mainnet", "sepolia"]) {
      // Each network's own router, so that the pin lets the quote be read.
      const economy = new FakeEconomy();
      economy.router_ = on(network).expectedRouter;
      // The page fixture's client has no RPC: the on-chain quote cannot be read (not a revert), so nothing is offered.
      land({ pool: "network", deployment: on(network), economy });
      fireEvent.click(await screen.findByText(/mode challenge/));
      expect(await screen.findByText(POOL_QUOTE_UNAVAILABLE)).toBeTruthy();
      expect((screen.getByText("Pool quote unavailable", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
      cleanup();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("shows the least PAVED bought: the pool's quote of the one swap (burn quote + margin) less the slippage", async () => {
    const pool = new FakePoolQuoter();
    const economy = new FakeEconomy();
    land({ pool, economy });
    fireEvent.click(await screen.findByText(/mode challenge/));
    const least = await economy.expectedMinOut(1);
    expect(await screen.findByText(`PAVED bought: at least ${paved(least)} (quoted again when sent)`)).toBeTruthy();
    // No referrer: the whole price is swapped once.
    expect(pool.calls).toContain((await economy.quote(1)).price);
    expect(pool.calls).not.toContain((await economy.quote(1)).burnQuote);
    fireEvent.click(await enabled("Buy for 2 USDC"));
    expect(screen.getByText(`At least ${paved(least)} bought: if the pool moved down by the time it is sent, nothing is sent and you confirm again.`)).toBeTruthy();
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=challenge|"));
    // The floor the player confirmed rides in the intent.
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))?.confirmedMinOut).toBe(least);
  });

  it("labels the burn share 'at today's terms' at the picker and at the confirm (burn_bps may change before the transaction)", async () => {
    land();
    fireEvent.click(await screen.findByText(/mode challenge/));
    // Stake 1: 2 USDC swapped once; the PAVED of the fake's burn_bps (70 %) is burned, the margin's to the Vault (P-56).
    expect(await screen.findByText("Swapped for PAVED in one swap: 2 USDC")).toBeTruthy();
    expect(await screen.findByText("Burned: the PAVED of 1.4 USDC of the price (70 %), at today's terms; the Vault (vPAVED) gets the PAVED of 30 % of the price")).toBeTruthy();
    fireEvent.click(await enabled("Buy for 2 USDC"));
    const dialog = screen.getByRole("dialog", { name: "Confirm purchase" });
    expect(dialog.textContent).toContain("2 USDC swapped for PAVED in one swap: the PAVED of 1.4 USDC of the price (70 %), at today's terms is burned, that of 30 % of the price goes to the Vault for the stakers.");
  });

  it("the split shown is the chain's (split_bps, owner-set): the deployed 73.68 / 26.32, and with a referrer the Vault's part less the referral", async () => {
    const economy = new FakeEconomy();
    economy.split_ = { burn: 7_368, vault: 2_632, referral: 500 };
    const pool = new FakePoolQuoter();
    land({ economy, pool, search: `?ref=${REFERRER}` });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText("Burned: the PAVED of 1.47 USDC of the price (73.68 %), at today's terms; the Vault (vPAVED) gets the PAVED of 21.32 % of the price, after the referrer's 5 %")).toBeTruthy();
    // The margin's PAVED, as the contract splits the swap by input, from min_out: a floor.
    const quote = await economy.quote(1);
    const swapIn = quote.price - quote.referral;
    const least = await economy.expectedMinOut(1, new FakePoolQuoter(), true);
    expect(await screen.findByText(`To the Vault: at least ${paved((least * (swapIn - quote.burnQuote)) / swapIn)}, which raises its rate`)).toBeTruthy();
    expect(economy.calls).toContain("split");
    fireEvent.click(await enabled("Buy for 2 USDC"));
    expect(screen.getByRole("dialog", { name: "Confirm purchase" }).textContent).toMatch(/Referrer .+ gets 0\.1 USDC out of the stakers' margin/);
  });

  it("a split that cannot be read hides the breakdown; the purchase itself does not depend on it", async () => {
    const economy = new FakeEconomy();
    economy.split = async () => {
      throw new Error("node down");
    };
    land({ economy });
    fireEvent.click(await screen.findByText(/mode challenge/));
    await enabled("Buy for 2 USDC");
    expect(screen.queryByText(/^Burned: /)).toBeNull();
  });

  it("a pool quote at 95 % of the guard-rate value: no warning, no extra confirmation", async () => {
    land();
    fireEvent.click(await screen.findByText(/mode challenge/));
    fireEvent.click(await enabled("Buy for 2 USDC"));
    expect(screen.queryByText(/the guard rate implies/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=challenge|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))?.acceptedLowQuote).toBe(false);
  });

  it("a pool quote below 90 % of the guard-rate value: both figures, and Confirm needs the explicit acceptance", async () => {
    const pool = new FakePoolQuoter();
    pool.rate = { paved: 70n * 10n ** 18n, usdc: 1_000_000n }; // 95 % of 70/80: 83.1 % of the guard-rate value
    land({ pool });
    fireEvent.click(await screen.findByText(/mode challenge/));
    const quote = await pool.quoteSwap(2_000_000n);
    const text = `The pool quotes ${paved(quote)} for the swap, below 90 % of the ${paved(160n * P)} the guard rate implies: the pool may have been pushed.`;
    expect(await screen.findByText(text)).toBeTruthy();
    fireEvent.click(await enabled("Buy for 2 USDC"));
    const confirm = screen.getByText("Confirm purchase") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(where()).toMatch(/^\/\|/);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(where()).toContain("/game?mode=challenge|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))).toMatchObject({ stake: 1, acceptedLowQuote: true, confirmedMinOut: (quote * 99n) / 100n });
  });

  it("a router that is not the pinned one: the plain message, no quote read, no purchase offered", async () => {
    const pool = new FakePoolQuoter();
    const economy = new FakeEconomy();
    economy.router_ = MAINNET_ROUTER; // not this devnet's MockRouter
    land({ pool, economy });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText(ROUTER_NOT_PINNED)).toBeTruthy();
    expect((screen.getByText("Purchases are off", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/PAVED bought: at least/)).toBeNull();
    expect(pool.calls).toHaveLength(0);
  });

  it("the acceptance of a low quote is for that quote: a quote read again needs a fresh tick", async () => {
    const pool = new FakePoolQuoter();
    pool.rate = { paved: 70n * 10n ** 18n, usdc: 1_000_000n };
    land({ pool });
    fireEvent.click(await screen.findByText(/mode challenge/));
    fireEvent.click(await enabled("Buy for 2 USDC"));
    fireEvent.click(screen.getByRole("checkbox"));
    const confirm = screen.getByText("Confirm purchase") as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    // The page is shown again and the quote is read again, lower still.
    pool.rate = { paved: 60n * 10n ** 18n, usdc: 1_000_000n };
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(await screen.findAllByText(new RegExp(`The pool quotes ${paved(await pool.quoteSwap(2_000_000n)).replace(".", "\\.")}`))).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false));
    expect(confirm.disabled).toBe(true);
    visibility.mockRestore();
  });

  it("the acceptance of a low quote is for the figures it was given next to: a guard rate that moved needs a fresh tick", async () => {
    const pool = new FakePoolQuoter();
    pool.rate = { paved: 70n * 10n ** 18n, usdc: 1_000_000n };
    const economy = new FakeEconomy();
    land({ pool, economy });
    fireEvent.click(await screen.findByText(/mode challenge/));
    fireEvent.click(await enabled("Buy for 2 USDC"));
    fireEvent.click(screen.getByRole("checkbox"));
    const confirm = screen.getByText("Confirm purchase") as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    // The guard rate moves up; the pool's quote is the same and still low.
    economy.guardRate_ = economy.guardRate_ * 2n;
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(await screen.findAllByText(new RegExp(`the ${paved(320n * P).replace(".", "\\.")} the guard rate implies`))).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false));
    expect(confirm.disabled).toBe(true);
    visibility.mockRestore();
  });

  it("an RPC on another chain than the deployment's: the plain message, nothing quoted, no purchase offered", async () => {
    const pool = new FakePoolQuoter();
    const economy = new FakeEconomy();
    land({ pool, economy, rpcChainId: "0x534e5f4d41494e" });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText(CHAIN_MISMATCH)).toBeTruthy();
    expect((screen.getByText("Purchases are off", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
    expect(pool.calls).toHaveLength(0);
    expect(economy.calls).not.toContain("router");
  });

  it("a failed chain read at page open is read again when the page is shown again: Buy is offered", async () => {
    let down = true;
    land({
      rpcChain: () => {
        if (down) throw new Error("rpc down");
        return FAKE_CHAIN_ID;
      },
    });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText(/Cannot read the network: rpc down/)).toBeTruthy();
    expect((screen.getByText("Purchases are off", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
    down = false;
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await enabled("Buy for 2 USDC");
    expect(screen.queryByText(/Cannot read the network/)).toBeNull();
    visibility.mockRestore();
  });

  it("a chain mismatch stays refused when the page is shown again", async () => {
    const pool = new FakePoolQuoter();
    land({ pool, rpcChainId: "0x534e5f4d41494e" });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText(CHAIN_MISMATCH)).toBeTruthy();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText(CHAIN_MISMATCH)).toBeTruthy();
    expect((screen.getByText("Purchases are off", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
    expect(pool.calls).toHaveLength(0);
    visibility.mockRestore();
  });

  it("mainnet, rate 0 (unexpected): refused, nothing quoted, no purchase offered", async () => {
    const SN_MAIN = "0x534e5f4d41494e";
    const pool = new FakePoolQuoter();
    const economy = new FakeEconomy();
    economy.router_ = MAINNET_ROUTER;
    economy.guardRate_ = 0n;
    const deployment = resolveEconomyDeployment({ base: { ...base, network: "mainnet", chainId: SN_MAIN }, env: ECON });
    land({ pool, economy, deployment, rpcChainId: SN_MAIN });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText(RATE_UNAVAILABLE)).toBeTruthy();
    expect((screen.getByText("Purchases paused", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
    expect(pool.calls).toHaveLength(0);
  });

  it("mainnet at a rate above 0: offered as before", async () => {
    const SN_MAIN = "0x534e5f4d41494e";
    const economy = new FakeEconomy();
    economy.router_ = MAINNET_ROUTER;
    const deployment = resolveEconomyDeployment({ base: { ...base, network: "mainnet", chainId: SN_MAIN }, env: ECON });
    land({ economy, deployment, rpcChainId: SN_MAIN });
    fireEvent.click(await screen.findByText(/mode challenge/));
    await enabled("Buy for 2 USDC");
    expect(screen.queryByText(RATE_UNAVAILABLE)).toBeNull();
  });

  it("Sepolia at a guard rate of 0: no warning, the purchase is offered", async () => {
    const economy = new FakeEconomy();
    economy.guardRate_ = 0n;
    const deployment = resolveEconomyDeployment({ base: { ...base, network: "sepolia" }, file: FAKE_ROUTER_FILE, env: ECON });
    land({ economy, deployment });
    fireEvent.click(await screen.findByText(/mode challenge/));
    fireEvent.click(await enabled("Buy for 2 USDC"));
    expect(screen.queryByText(RATE_UNAVAILABLE)).toBeNull();
    expect(screen.queryByText(/the guard rate implies/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("a quote_swap that reverts (the pool cannot fill): the plain message, no quote shown, no purchase offered", async () => {
    const pool = new FakePoolQuoter();
    pool.fail = "Economy: partial fill";
    land({ pool });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText(POOL_CANNOT_FILL)).toBeTruthy();
    expect(screen.queryByText(/PAVED bought: at least/)).toBeNull();
    expect(screen.queryByText(/partial fill/)).toBeNull();
    expect((screen.getByText("Pool cannot fill", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a quote that cannot be read (RPC, rate limit, timeout) is not a revert: 'cannot read the pool quote', no figure, no purchase", async () => {
    const pool = new FakePoolQuoter();
    pool.fail = "Too many requests (429)";
    land({ pool });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText(POOL_QUOTE_UNAVAILABLE)).toBeTruthy();
    expect(screen.queryByText(POOL_CANNOT_FILL)).toBeNull();
    expect(screen.queryByText(/PAVED bought: at least/)).toBeNull();
    expect((screen.getByText("Pool quote unavailable", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("no stale quote: a stake the pool cannot fill hides the previous stake's figure", async () => {
    const pool = new FakePoolQuoter();
    const quoteSwap = pool.quoteSwap.bind(pool);
    // Fills up to 5 USDC of burn: stake 1 (1.4 USDC) quotes, stake 10 (14 USDC) reverts.
    pool.quoteSwap = async (usdcIn: bigint) => (usdcIn > 5_000_000n ? Promise.reject(new Error("Economy: partial fill")) : quoteSwap(usdcIn));
    land({ pool });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText(/PAVED bought: at least/)).toBeTruthy();
    fireEvent.click(screen.getByText("10", { selector: "button" }));
    expect(await screen.findByText(POOL_CANNOT_FILL)).toBeTruthy();
    expect(screen.queryByText(/PAVED bought: at least/)).toBeNull();
    expect((screen.getByText("Pool cannot fill", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("1", { selector: "button" }));
    expect(await screen.findByText(/PAVED bought: at least/)).toBeTruthy();
    expect(screen.queryByText(POOL_CANNOT_FILL)).toBeNull();
  });

  it("no stale quote: a read again that fails (the page shown again) drops the figure it had", async () => {
    const pool = new FakePoolQuoter();
    land({ pool });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText(/PAVED bought: at least/)).toBeTruthy();
    pool.fail = "Economy: partial fill";
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(await screen.findByText(POOL_CANNOT_FILL)).toBeTruthy();
    expect(screen.queryByText(/PAVED bought: at least/)).toBeNull();
    visibility.mockRestore();
  });

  it("shows the slippage, the 24 h expiry and the current reference, never a day mean or projected reward", async () => {
    const economy = new FakeEconomy();
    economy.days.set(DAY, { prior: 3_980_000, sum: 0n, weight: 0, mean: 0, closed: false });
    land({ economy });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText("Slippage on the swap: 1 % (at most 5 %)")).toBeTruthy();
    expect(screen.getByText("A paid game expires 24 h after its purchase; an expired game gets no reward.")).toBeTruthy();
    expect(
      screen.getAllByText("Current reference: mean 3980 points, threshold 3980 points; the day's own mean is known only at settlement.").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/mean 0 points/)).toBeNull();
    expect(screen.queryByText(/projected|estimated|expected reward/i)).toBeNull();
  });

  it("a failed read disables the purchase", async () => {
    const economy = new FakeEconomy();
    economy.fail = "node down";
    land({ economy });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText(/Price unavailable: node down/)).toBeTruthy();
    expect((screen.getByText("Price unavailable", { selector: "button" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a quote that disagrees with the entry price disables the purchase", async () => {
    const economy = new FakeEconomy();
    economy.unit = 3_000_000n;
    land({ economy });
    fireEvent.click(await screen.findByText(/mode challenge/));
    expect(await screen.findByText(/the quote disagrees/)).toBeTruthy();
  });

  it("not deployed (a network without the economy addresses): the panel says so", async () => {
    land({ deployment: resolveEconomyDeployment({ base }) });
    expect(await screen.findByText(/Not deployed on devnet: Economy address/)).toBeTruthy();
    expect(screen.queryByText(/USDC, by stake/)).toBeNull();
  });
});

describe("the referral link's share is the chain's (split_bps().referral, owner-set since P-56)", () => {
  it("shows the chain's referral, here 7 %, not a fixed 5 %", async () => {
    const economy = new FakeEconomy();
    economy.split_ = { burn: 7_368, vault: 2_632, referral: 700 };
    land({ economy });
    expect(await screen.findByText("A player who buys through your link pays the same price; you get 7 % of it, out of the stakers' margin.")).toBeTruthy();
    expect(screen.queryByText(/you get 5 %/)).toBeNull();
  });

  it("an unreadable split or no economy shows no figure", async () => {
    const economy = new FakeEconomy();
    economy.split = async () => {
      throw new Error("node down");
    };
    land({ economy });
    expect(await screen.findByText("A player who buys through your link pays the same price; you get a share of it, out of the stakers' margin.")).toBeTruthy();
    cleanup();
    land({ deployment: resolveEconomyDeployment({ base }) });
    expect(await screen.findByText(/you get a share of it/)).toBeTruthy();
  });
});

describe("Vault (vPAVED, P-56): deposit and withdraw, each after a confirm; no claim", () => {
  /** A holder of 1 vPAVED at a rate of 1.5 PAVED per vPAVED (purchases' margins raised it), with the deployment's 5 % exit fee. */
  function holder() {
    const economy = new FakeEconomy();
    economy.vaultAssets = 1_500n * P;
    economy.vaultSupply = 1_000n * P;
    economy.setShares(PLAYER, P);
    economy.setBalance("paved", PLAYER, 5n * P);
    return economy;
  }

  it("shows the vPAVED, its PAVED value, the rate, the exit fee and max_withdraw; no dividends, no claim", async () => {
    const economy = holder();
    land({ economy });
    const { value, maxWithdraw } = await economy.vault(PLAYER);
    expect(await screen.findByText(`Your share: 1 vPAVED, worth ${paved(value)}`)).toBeTruthy();
    expect(screen.getByText(`Withdrawable now: ${paved(maxWithdraw)}, after the exit fee`)).toBeTruthy();
    // (1,501.5 PAVED + 1) / (1,001 vPAVED + 1) is just under 1.5: cut, not rounded.
    expect(screen.getByText("Rate: 1.4999 PAVED per vPAVED")).toBeTruthy();
    expect(screen.getByText("5 % exit fee, left to the other stakers")).toBeTruthy();
    expect(screen.getByText("Wallet: 5 PAVED")).toBeTruthy();
    expect(maxWithdraw < value).toBe(true);
    expect(screen.queryByText(/Dividends|Claim|USDC pending/)).toBeNull();
  });

  it("an exit fee of 2.5 % reads as such", async () => {
    const economy = holder();
    economy.exitFeeBps = 250;
    land({ economy });
    expect(await screen.findByText("2.5 % exit fee, left to the other stakers")).toBeTruthy();
  });

  it("deposit sends approve + deposit(amount, self) of exactly the confirmed amount, only after Confirm", async () => {
    const economy = holder();
    const { writer } = land({ economy });
    const field = await screen.findByLabelText("Vault amount");
    fireEvent.change(field, { target: { value: "1.5" } });
    fireEvent.click(await enabled("Deposit"));
    const dialog = await screen.findByRole("dialog", { name: "Confirm" });
    expect(dialog.textContent).toContain(`Deposit 1.5 PAVED for about ${vpaved(await economy.previewDeposit(15n * 10n ** 17n))}?`);
    expect(writer.sendCalls).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Confirm deposit"));
    await waitFor(() => expect(writer.sent).toHaveLength(1));
    expect(writer.sent[0].map((c) => [c.contractAddress, c.entrypoint])).toEqual([[ECON.pavedToken, "approve"], [ECON.vault, "deposit"]]);
    expect(writer.sent[0][1].calldata).toEqual([`0x${(15n * 10n ** 17n).toString(16)}`, "0x0", PLAYER]);
  });

  it("withdraw shows the vPAVED it uses, the fee included, and sends withdraw(amount, self, self)", async () => {
    const economy = holder();
    const { writer } = land({ economy });
    fireEvent.change(await screen.findByLabelText("Vault amount"), { target: { value: "1" } });
    fireEvent.click(await enabled("Withdraw"));
    const dialog = await screen.findByRole("dialog", { name: "Confirm" });
    expect(dialog.textContent).toContain(`Withdraw 1 PAVED? It uses about ${vpaved(await economy.previewWithdraw(P))}, the 5 % exit fee, left to the other stakers included.`);
    fireEvent.click(screen.getByText("Confirm withdraw"));
    await waitFor(() => expect(writer.sent).toHaveLength(1));
    expect(writer.sent[0].map((c) => [c.entrypoint, c.calldata])).toEqual([["withdraw", ["0xde0b6b3a7640000", "0x0", PLAYER, PLAYER]]]);
  });

  it("a withdraw above max_withdraw is refused with a plain message, nothing sent", async () => {
    const economy = holder();
    const { writer } = land({ economy });
    const { value, maxWithdraw } = await economy.vault(PLAYER);
    await screen.findByText(/Your share: 1 vPAVED/);
    // The value before the fee: above max_withdraw by the fee.
    fireEvent.change(screen.getByLabelText("Vault amount"), { target: { value: formatUnits(value, 18) } });
    fireEvent.click(await enabled("Withdraw"));
    expect(await screen.findByText(`More than you can withdraw: at most ${paved(maxWithdraw)} now, the exit fee taken. Nothing was sent.`)).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Confirm" })).toBeNull();
    expect(writer.sendCalls).not.toHaveBeenCalled();
  });

  it("withdraw all redeems every vPAVED held for their PAVED less the fee", async () => {
    const economy = holder();
    const { writer } = land({ economy });
    const { maxWithdraw } = await economy.vault(PLAYER);
    fireEvent.click(await enabled("Withdraw all"));
    expect(screen.getByRole("dialog", { name: "Confirm" }).textContent).toContain(`Withdraw everything: 1 vPAVED for about ${paved(maxWithdraw)}, after the 5 % exit fee, left to the other stakers?`);
    fireEvent.click(screen.getByText("Confirm withdraw"));
    await waitFor(() => expect(writer.sent).toHaveLength(1));
    expect(writer.sent[0].map((c) => [c.entrypoint, c.calldata])).toEqual([["redeem", ["0xde0b6b3a7640000", "0x0", PLAYER, PLAYER]]]);
  });

  it("vPAVED that changed between the confirm and the send: the new amount is said, nothing sent", async () => {
    const economy = holder();
    const { writer } = land({ economy });
    fireEvent.click(await enabled("Withdraw all"));
    economy.setShares(PLAYER, 2n * P); // a transfer in meanwhile
    fireEvent.click(screen.getByText("Confirm withdraw"));
    expect(await screen.findByText("Your vPAVED changed from 1 vPAVED to 2 vPAVED: confirm again")).toBeTruthy();
    expect(writer.sent).toHaveLength(0);
  });

  it("a deposit too small to mint any vPAVED is refused with a plain message, nothing sent", async () => {
    const economy = holder();
    const { writer } = land({ economy });
    fireEvent.change(await screen.findByLabelText("Vault amount"), { target: { value: "0.000000000000000001" } });
    fireEvent.click(await enabled("Deposit"));
    expect(await screen.findByText("This amount is too small to get any vPAVED: deposit more. Your PAVED was not moved.")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Confirm" })).toBeNull();
    expect(writer.sendCalls).not.toHaveBeenCalled();
  });

  it("an amount edited after the first click is refused at send", async () => {
    const economy = holder();
    const { writer } = land({ economy });
    const field = await screen.findByLabelText("Vault amount");
    fireEvent.change(field, { target: { value: "1" } });
    fireEvent.click(await enabled("Deposit"));
    await screen.findByRole("dialog", { name: "Confirm" });
    fireEvent.change(field, { target: { value: "2" } });
    fireEvent.click(screen.getByText("Confirm deposit"));
    expect(await screen.findByText("The amount changed: confirm again")).toBeTruthy();
    expect(writer.sent).toHaveLength(0);
  });

  it("a holder of no vPAVED cannot withdraw all", async () => {
    land();
    expect(await screen.findByText(/Your share: 0 vPAVED/)).toBeTruthy();
    expect((screen.getByText("Withdraw all") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a Vault that cannot be read says so and offers no write", async () => {
    const economy = holder();
    economy.fail = "node down";
    land({ economy });
    expect(await screen.findByText(/Vault unavailable: /)).toBeTruthy();
    expect((screen.getByText("Withdraw all") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("after the day: settle with the cliff stated", () => {
  const NOW = settlesAfter(DAY);
  const game = (gameId: number, over: boolean, startTime = DAY * 86400) => ({ mode: "challenge", gameId, startTime, dayId: DAY, over, score: over ? 4000 : null, countedDayId: over ? DAY : null });

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

describe("new games paused (G4)", () => {
  const PAUSED = "New Challenge games are paused for now. Games already started can still be played.";
  const game = (gameId: number, over: boolean) => ({ mode: "challenge", gameId, startTime: DAY * 86400, dayId: DAY, over, score: over ? 4000 : null, countedDayId: over ? DAY : null });

  it("paused: the card and the dialog say so, the buy button is disabled, nothing is sent", async () => {
    const { writer } = land({ paused: true });
    expect((await screen.findByTestId("notice-challenge")).textContent).toBe(PAUSED);
    fireEvent.click(await screen.findByText(/^mode challenge:/));
    await waitFor(() => expect(screen.getAllByText(PAUSED).length).toBeGreaterThan(1));
    const buy = screen.getByText("New games paused", { selector: "button" }) as HTMLButtonElement;
    expect(buy.disabled).toBe(true);
    fireEvent.click(buy);
    expect(screen.queryByRole("dialog", { name: "Confirm purchase" })).toBeNull();
    expect(where()).toMatch(/^\/\|/);
    expect(writer.sendCalls).not.toHaveBeenCalled();
  });

  it("not paused: no notice, the purchase is offered as before", async () => {
    land({ paused: false });
    fireEvent.click(await screen.findByText(/^mode challenge:/));
    expect((await enabled("Buy for 2 USDC")).disabled).toBe(false);
    expect(screen.queryByTestId("notice-challenge")).toBeNull();
    expect(screen.queryByText(PAUSED)).toBeNull();
  });

  it("the read fails: today's behaviour, no notice and the purchase is offered", async () => {
    land({ paused: new Error("rpc down") });
    fireEvent.click(await screen.findByText(/^mode challenge:/));
    expect((await enabled("Buy for 2 USDC")).disabled).toBe(false);
    expect(screen.queryByTestId("notice-challenge")).toBeNull();
    expect(screen.queryByText(PAUSED)).toBeNull();
  });

  it("a game already started while paused: the dialog resumes it, and nothing is bought", async () => {
    const { writer } = land({ paused: true, games: [game(1, false)] });
    fireEvent.click(await screen.findByText(/^mode challenge:/));
    const resume = (await screen.findByText("Resume Game")) as HTMLButtonElement;
    expect(resume.disabled).toBe(false);
    expect(screen.queryByLabelText("Purchase")).toBeNull();
    fireEvent.click(resume);
    await waitFor(() => expect(where()).toContain("&id=1|null"));
    expect(writer.sendCalls).not.toHaveBeenCalled();
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
    fireEvent.click(await enabled("Buy for 2 USDC"));
    fireEvent.click(screen.getByText("Confirm purchase"));
    await waitFor(() => expect(where()).toContain("/game?mode=challenge|"));
    expect(readPurchaseIntent(JSON.parse(where().split("|")[1]))).toEqual({ stake: 1, confirmedPrice: 2_000_000n, referrer: REFERRER, confirmedMinOut: await floor(1, true), acceptedLowQuote: false });
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
    const purchase = { stake: 2, confirmedPrice: 4_000_000n, referrer: null, confirmedMinOut: 5n };
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
    expect(readPurchaseIntent(purchaseIntent(3, 6_000_000n, null, 7n))).toEqual({ stake: 3, confirmedPrice: 6_000_000n, referrer: null, confirmedMinOut: 7n, acceptedLowQuote: false });
    expect(readPurchaseIntent(null)).toBeNull();
    expect(readPurchaseIntent({ start: true, confirmedAmount: "10" })).toBeNull();
    expect(readPurchaseIntent({ start: true, purchase: { stake: 11, confirmedPrice: "1", referrer: null } })).toBeNull();
    expect(readPurchaseIntent({ start: true, purchase: { stake: 1, confirmedPrice: "0", referrer: null } })).toBeNull();
    expect(readPurchaseIntent({ start: true, purchase: { stake: 1, confirmedPrice: 2_000_000, referrer: null } })).toBeNull();
    expect(readPurchaseIntent({ start: true, purchase: { stake: 1, confirmedPrice: "2000000", referrer: "bob", confirmedMinOut: "1" } })).toBeNull();
    // The confirmed floor (min_out), as strict as the price: missing, 0, a number, a sign, a fraction or hex buys nothing.
    const withFloor = (confirmedMinOut: unknown) => ({ start: true, purchase: { stake: 1, confirmedPrice: "2000000", referrer: null, confirmedMinOut } });
    expect(readPurchaseIntent({ start: true, purchase: { stake: 1, confirmedPrice: "2000000", referrer: null } })).toBeNull();
    for (const bad of [undefined, null, "", "0", "-1", "01", "1.5", "0x10", " 1", 10, 10n]) expect(readPurchaseIntent(withFloor(bad))).toBeNull();
    expect(readPurchaseIntent(withFloor("1"))?.confirmedMinOut).toBe(1n);
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

  it("the economy's addresses come from the same network's file; VITE_USDC_ADDRESS is ignored on devnet (the entry token is the Faucet)", () => {
    const files = { "/x/devnet.json": { default: { contracts: { Economy: { address: "0x20" }, PavedToken: { address: "0x21" }, Vault: { address: "0x22" }, Faucet: { address: "0x23" } } } } };
    const withFaucet = { ...base, faucet: "0x23" }; // the base's faucet is the one resolution
    expect(resolveEconomyNetwork(withFaucet, {}, files).configured).toBe(true);
    expect(resolveEconomyNetwork(withFaucet, { VITE_USDC_ADDRESS: "0x99" }, files).addresses.USDC).toBe("0x23");
    expect(resolveEconomyNetwork(base, {}, {}).configured).toBe(false);
  });
});
