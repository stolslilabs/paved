import { slow } from "../test-slow";
import type { ReactNode } from "react";
import { act, cleanup, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domMax } from "motion/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "starknet";
import {
  PackOutcomeUnknownError,
  PackPriceChangedError,
  PackRefusedError,
  PoolPriceMovedError,
  PoolQuoteBelowFloorError,
  PurchaseOutcomeUnknownError,
  SendUnconfirmedError,
  SpawnPausedError,
  SwapBelowMinOutError,
  WalletRejectedError,
  WriteError,
  PavedClient,
  createCodecs,
  createEconomyClient,
  resolveDeployment,
  resolveEconomyDeployment,
  type PavedRpc,
} from "@paved/chain";
import { FAKE_CHAIN_ID, FAKE_ROUTER_FILE, FAKE_UNIT, FIXTURE_HEAD } from "@paved/chain/testing";
import { App } from "../src/App";
import { CobblesScene } from "../src/components/scenes/cobbles-scene";
import { PurchaseScene } from "../src/components/scenes/purchase-scene";
import { DataProvider, type DataSources, type GameSigner } from "../src/data";
import { purchasesFor } from "../src/data/economy-client";
import { PURCHASE_RECHECK_MS, PURCHASE_TIMEOUT_MS, PurchaseTimedOutError, purchaseRefusal, referrerParam, setPurchaseRecheckForTests, usePurchase } from "../src/data/purchase";
import {
  currentRecord,
  lateAnswerStorageKey,
  recordOwnSend,
  resetAsideForTests,
  resetFailedWritesForTests,
  unknownPurchaseStorageKey,
  writeUnknownPurchase,
} from "../src/data/unknown-purchase";
import { queryClient } from "../src/lib/query-client";
import { COBBLES, PURCHASE } from "../src/mocks/scenes";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// `/play/challenge` (P7b) on `@paved/chain`'s fakes: `FakeEconomy` and `FakePoolQuoter` for the reads, `FakeGameViews` for
// `spawn_paused`, the entry price and the packs, and the real writers (`EconomyWriter`, `PackBuyer`, `PavedWriter`) on an
// account that records what it signs and a node that answers each send with the receipt the contracts would emit.

const PLAYER = "0x5f1";
const REF = "0x77";
const ADDR = { Challenge: "0x2", Setup: "0x3" };
const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12" };
const USDC = "0x13";
const GAME_ID = 9;
const USDC_UNIT = 1_000_000n;

type Sent = Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>;

/** The default packs (CORE #453), a pack never set (5) and one off sale (6). */
const PACKS = [
  { packId: 1, cobbles: 50, price: 5_000_000n, active: true },
  { packId: 2, cobbles: 100, price: 9_000_000n, active: true },
  { packId: 3, cobbles: 500, price: 40_000_000n, active: true },
  { packId: 4, cobbles: 1_000, price: 70_000_000n, active: true },
  { packId: 6, cobbles: 20, price: 1_000_000n, active: false },
];

function setup(options: { signer?: boolean; usdc?: bigint; revert?: string } = {}) {
  const fakes = fakeSources();
  const { views, economy, pool } = fakes;
  views.price = { token: USDC, amount: FAKE_UNIT };
  for (const p of PACKS) views.packs.set(p.packId, { ...p });
  views.cobblePlayer(PLAYER).account.cobbles = 240;
  economy.setBalance("usdc", PLAYER, options.usdc ?? 100n * USDC_UNIT);

  const sent: Sent[] = [];
  /**
   * `gate`: while set, the account waits for it before answering (the page's pending state). `noEvents`: the receipt carries
   * no event (an unknown outcome). `balanceGate`, `balanceFail`, `packsGate`: the USDC balance's and the packs' reads wait,
   * or the balance's fails. `balanceGateAt`: only that call of `usdcBalance` (1-based) waits for `balanceGate`.
   * `receipts`: what `getTransactionReceipt` answers by hash (a hash not listed is unknown to the node, error 29);
   * `receiptGate`: the receipt's read waits for it.
   */
  const state: {
    gate: Promise<void> | null;
    revert: string | null;
    noEvents: boolean;
    balanceGate: Promise<void> | null;
    balanceGateAt: number | null;
    balanceCalls: number;
    balanceFail: string | null;
    packsGate: Promise<void> | null;
    receipts: Map<string, "SUCCEEDED" | "REVERTED">;
    receiptGate: Promise<void> | null;
    receiptFail: string | null;
    receiptCalls: number;
    /** While set (a function), the account rejects with what it returns, as a wallet whose prompt the player declined. */
    decline: (() => unknown) | null;
  } = {
    gate: null,
    revert: options.revert ?? null,
    noEvents: false,
    balanceGate: null,
    balanceGateAt: null,
    balanceCalls: 0,
    balanceFail: null,
    packsGate: null,
    receipts: new Map(),
    receiptGate: null,
    receiptFail: null,
    receiptCalls: 0,
    decline: null,
  };
  const usdcBalance = economy.usdcBalance.bind(economy);
  economy.usdcBalance = async (account) => {
    const call = ++state.balanceCalls;
    if (state.balanceGate && (state.balanceGateAt === null || state.balanceGateAt === call)) await state.balanceGate;
    if (state.balanceFail) throw new Error(state.balanceFail);
    return usdcBalance(account);
  };
  const pack = views.pack.bind(views);
  views.pack = async (id) => {
    if (state.packsGate) await state.packsGate;
    return pack(id);
  };
  const account = {
    address: PLAYER,
    execute: async (calls: Sent) => {
      if (state.decline) throw state.decline();
      sent.push(calls);
      if (state.gate) await state.gate;
      return { transaction_hash: `0x${sent.length.toString(16)}` };
    },
  };
  /** The receipt of the last send: `GameSpawned` for a spawn, `PackBought` for a pack (the fake ledger follows it). */
  const receipt = async () => {
    if (state.revert) return { execution_status: "REVERTED", revert_reason: `Failure reason: '${state.revert}'.` };
    if (state.noEvents) return { execution_status: "SUCCEEDED", events: [] };
    const calls = sent[sent.length - 1];
    const spawn = calls.find((c) => c.entrypoint === "spawn");
    if (spawn) {
      return { execution_status: "SUCCEEDED", events: [{ from_address: ADDR.Challenge, keys: [hash.getSelectorFromName("GameSpawned"), `0x${GAME_ID.toString(16)}`, PLAYER], data: ["0x1", "0x4e20", "0x1", "0x0"] }] };
    }
    const buy = calls.find((c) => c.entrypoint === "buy_pack");
    if (buy) {
      const pack = PACKS.find((p) => p.packId === Number(buy.calldata[0]))!;
      const ledger = views.cobblePlayer(PLAYER).account;
      ledger.cobbles += pack.cobbles;
      const referrer = BigInt(buy.calldata[1]) === 0n ? "0x0" : buy.calldata[1];
      const data = [`0x${pack.packId.toString(16)}`, `0x${pack.cobbles.toString(16)}`, `0x${pack.price.toString(16)}`, referrer, `0x${ledger.cobbles.toString(16)}`];
      return { execution_status: "SUCCEEDED", events: [{ from_address: ADDR.Setup, keys: [hash.getSelectorFromName("PackBought"), PLAYER], data }] };
    }
    return { execution_status: "SUCCEEDED", events: [] };
  };
  const getTransactionReceipt = async (hash: string) => {
    state.receiptCalls++;
    if (state.receiptGate) await state.receiptGate;
    if (state.receiptFail) throw new Error(state.receiptFail);
    const status = state.receipts.get(hash);
    if (!status) throw Object.assign(new Error("RPC: starknet_getTransactionReceipt: 29: Transaction hash not found"), { code: 29 });
    return { execution_status: status };
  };
  const rpc = {
    callContract: async () => [],
    getChainId: async () => FAKE_CHAIN_ID,
    getEvents: async () => ({ events: [] }),
    waitForTransaction: receipt,
    getTransactionReceipt,
  } as unknown as PavedRpc;
  const base = resolveDeployment({ network: "devnet", file: FAKE_ROUTER_FILE, env: { rpcUrl: "http://x", addresses: ADDR } });
  const client = new PavedClient({ ...base, chainId: FAKE_CHAIN_ID }, rpc, createCodecs(), views);
  const econ = createEconomyClient(resolveEconomyDeployment({ base: { ...base, chainId: FAKE_CHAIN_ID }, file: FAKE_ROUTER_FILE, env: ECON }), client, economy, pool)!;
  const writer = client.writer(account);
  fakes.sources.signer = options.signer === false ? null : (writer as unknown as GameSigner);
  // The app's own purchases (`data/economy-client.ts`), on this economy client.
  fakes.sources.purchases = (signer) => purchasesFor(econ, signer);
  return { ...fakes, sent, state, writer, client, econ };
}

function open(path: string, s: ReturnType<typeof setup>, wallet = fakeWallet({ address: PLAYER })) {
  const router = createTestRouter(path);
  render(<App router={router} sources={s.sources} connector={wallet.load} />);
  return { router, wallet };
}

const pay = (name: RegExp = /Pay .* and play/) => screen.findByRole("button", { name }, { timeout: slow(3000) });
/** Pay, once the pool's quote has been read (the button waits for `min_out`). */
async function enabledPay(name?: RegExp) {
  const button = await pay(name);
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}
const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const u256 = (low: string, high: string) => BigInt(low) + (BigInt(high) << 128n);

// The board a spawn opens is not under test here (these tests assert the route it opens; `challenge-route.test.tsx` runs the
// board on a challenge): a stand-in keeps the renderer and three out of this file.
vi.mock("../src/routes/pages/board", async () => (await import("./route-helpers")).boardStandInModule);
preloadPages("purchase", "cobbles", "home");

beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetFailedWritesForTests();
  resetAsideForTests();
  // The re-checks of an unknown receipt, short on real timers (their own test runs the real ones on fake timers).
  setPurchaseRecheckForTests([10, 10, 10]);
  resetWelcomedForTests();
  markWelcomed();
});

/** Pays a stake whose receipt shows no event: the outcome is unknown, recorded under the send's hash (0x1). */
async function unknownGame(s: ReturnType<typeof setup>) {
  const opened = open("/play/challenge", s);
  const button = await enabledPay();
  s.state.noEvents = true;
  await userEvent.click(button);
  expect(await screen.findByText("Outcome unknown", undefined, { timeout: slow(3000) })).toBeInTheDocument();
  return opened;
}

/** The check cannot tell (its re-checks done): the player confirms that their balance and games show no purchase. */
async function confirmNone() {
  await userEvent.click(await screen.findByRole("button", { name: "It did not land" }, { timeout: slow(3000) }));
}

/** A reload: the page and the app's cache gone, the browser's storage kept. */
function reload(s: ReturnType<typeof setup>, path = "/play/challenge") {
  // Unmounted, not only cleared: a page left mounted would keep checking (its re-checks) beside the new one.
  cleanup();
  queryClient.clear();
  return open(path, s);
}
afterEach(() => {
  setPurchaseRecheckForTests(null);
  vi.restoreAllMocks();
  resetWelcomedForTests();
});

describe("/play/challenge: the game's stake", () => {
  it("stake, then spawn, then the board: approve the price to Challenge and spawn(stake, referrer, min_out)", async () => {
    const s = setup();
    const { router } = open("/play/challenge", s);
    expect(await screen.findByRole("heading", { level: 1, name: "Challenge" })).toBeInTheDocument();
    await enabledPay();
    const slider = screen.getByRole("slider", { name: "Stake" });
    slider.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByTestId("stake-value")).toHaveTextContent("3");
    await userEvent.click(await enabledPay(/Pay .*6\.00.* and play/));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${GAME_ID}`));
    const [calls] = s.sent;
    expect(calls.map((c) => [c.contractAddress, c.entrypoint])).toEqual([[USDC, "approve"], [ADDR.Challenge, "spawn"]]);
    expect(BigInt(calls[0].calldata[0])).toBe(BigInt(ADDR.Challenge));
    expect(u256(calls[0].calldata[1], calls[0].calldata[2])).toBe(3n * FAKE_UNIT);
    // spawn(3, no referrer, min_out): the pool's quote of the 6 USDC swap, less 1 %.
    const minOut = ((((6n * USDC_UNIT * 95n * 80n * 10n ** 18n) / (100n * USDC_UNIT)) * 9_900n) / 10_000n);
    expect([Number(calls[1].calldata[0]), BigInt(calls[1].calldata[1]), u256(calls[1].calldata[2], calls[1].calldata[3])]).toEqual([3, 0n, minOut]);
    expect(s.pool.calls).toContain(6n * USDC_UNIT);
  });

  it("the 24 h expiry is read against the chain's time, not the browser's (UTC-BOUND)", async () => {
    const s = setup();
    // The browser's clock is days away from the indexer's head, and stands still: the chain's time is the head plus the
    // seconds since it was read, so a loaded machine that took a second or more to reach the assertion read an expiry
    // seconds later (6 s, once).
    vi.useFakeTimers({ toFake: ["Date"], now: (FIXTURE_HEAD.timestamp + 5 * 86_400) * 1000 });
    try {
      open("/play/challenge", s);
      await enabledPay();
      // The expiry is the head's plus 24 h, in UTC.
      const expiry = new Date((FIXTURE_HEAD.timestamp + 86_400) * 1000).toISOString();
      await waitFor(() => expect(document.querySelector("time")).toHaveAttribute("dateTime", expiry));
      expect(document.querySelector("time")).toHaveTextContent(/^in 24 h · \w{3}, \w{3} \d+, \d{2}:\d{2} UTC$/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends the referrer of ?ref=, which keeps the 5 % out of the swap", async () => {
    const s = setup();
    open(`/play/challenge?ref=${REF}`, s);
    await userEvent.click(await enabledPay());
    await waitFor(() => expect(s.sent).toHaveLength(1));
    expect(BigInt(s.sent[0][1].calldata[1])).toBe(BigInt(REF));
    expect(s.pool.calls.at(-1)).toBe(1_900_000n);
  });

  it("shows the reward by score from the pool's quote and the guard's rate (#705)", async () => {
    const s = setup();
    open("/play/challenge", s);
    await enabledPay();
    const table = screen.getByRole("table", { name: "Estimated reward by score" });
    // Stake 1: the burn's 70 % of the pool's 152 PAVED is 106.4, boosted 1 %: R = 107.464. At the threshold (3,980) it pays
    // R x 1.222, and the cap R x 5.
    await waitFor(() => expect(table).toHaveAttribute("aria-busy", "false"));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("131.32");
    expect(within(table).getAllByRole("row").at(-1)).toHaveTextContent("537.32");
  });

  it("counts at most 110 % of the guard's rate in the reward by score", async () => {
    const s = setup();
    // 100 PAVED per USDC at the pool against a guard of 80: the burn's 133 PAVED count as 123.2, R = 124.432.
    s.pool.rate = { paved: 100n * 10n ** 18n, usdc: USDC_UNIT };
    open("/play/challenge", s);
    await enabledPay();
    const table = screen.getByRole("table", { name: "Estimated reward by score" });
    await waitFor(() => expect(table).toHaveAttribute("aria-busy", "false"));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("152.05");
    expect(within(table).getAllByRole("row").at(-1)).toHaveTextContent("622.16");
  });

  it("a guard's rate that cannot be read is said, not left busy, and Retry reads it again (#705)", async () => {
    const s = setup();
    const guardRate = s.economy.guardRate.bind(s.economy);
    let fail = true;
    s.economy.guardRate = async () => {
      if (fail) throw new Error("Economy.rate: the node did not answer.");
      return guardRate();
    };
    open("/play/challenge", s);
    await enabledPay();
    // The read and its one retry fail: why, the figures "—" and not busy, and Pay is still offered.
    expect(await screen.findByText("The reward cannot be estimated", undefined, { timeout: slow(5000) })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Estimated reward by score" });
    expect(table).toHaveAttribute("aria-busy", "false");
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("—");
    expect(screen.getByRole("button", { name: /Pay .* and play/ })).toBeEnabled();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Estimated reward by score" })).getAllByRole("row")[1]).toHaveTextContent("131.32"), { timeout: slow(3000) });
    expect(screen.queryByText("The reward cannot be estimated")).toBeNull();
  });

  it("a guest connects first: Pay is Connect to buy", async () => {
    const s = setup({ signer: false });
    const { wallet } = open("/play/challenge", s);
    await userEvent.click(await screen.findByRole("button", { name: "Connect to buy" }, { timeout: slow(3000) }));
    await waitFor(() => expect(wallet.calls).toContain("connect"));
    expect(s.sent).toEqual([]);
  });

  it("paused: Pay is disabled and says why", async () => {
    const s = setup();
    s.views.paused = true;
    open("/play/challenge", s);
    expect(await screen.findByText("Purchases paused", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(await pay()).toBeDisabled();
  });

  it("not enough USDC: Pay is disabled and says why", async () => {
    const s = setup({ usdc: 1n * USDC_UNIT });
    open("/play/challenge", s);
    expect(await screen.findByText("Not enough USDC", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(await pay()).toBeDisabled();
  });

  it("a quote that moved since the confirm sends nothing, says so, and the next confirm takes the new min_out", async () => {
    const s = setup();
    open("/play/challenge", s);
    const button = await enabledPay();
    // Down 2.5 %: below the confirmed min_out, still above the guard rate's floor (90 %).
    s.pool.rate = { paved: 78n * 10n ** 18n, usdc: USDC_UNIT };
    await userEvent.click(button);
    // The player's price did not move: the pool's quote did.
    expect(await screen.findByText("The pool's quote moved", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.queryByText("The price moved")).toBeNull();
    expect(s.sent).toEqual([]);
    // The quote is read again: the next Pay sends at the new min_out.
    await waitFor(() => expect(s.pool.calls.filter((c) => c === 2n * USDC_UNIT).length).toBeGreaterThanOrEqual(3));
    await userEvent.click(await enabledPay());
    await waitFor(() => expect(s.sent).toHaveLength(1));
  });

  it("pending: the button waits for the wallet", async () => {
    const s = setup();
    let release = () => {};
    s.state.gate = new Promise<void>((r) => (release = r));
    open("/play/challenge", s);
    await userEvent.click(await enabledPay());
    expect(await screen.findByRole("button", { name: /Confirm in your wallet/ })).toHaveAttribute("aria-busy", "true");
    release();
  });

  it("refused: a revert the chain gave is shown, and the page stays", async () => {
    const s = setup({ revert: "Challenge: spawn paused" });
    const { router } = open("/play/challenge", s);
    await userEvent.click(await enabledPay());
    // Paused is a state (a `Notice`), not an error (P-67).
    expect((await screen.findAllByText(/paused/, undefined, { timeout: slow(3000) })).length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe("/play/challenge");
  });

  it("a ?ref= the contracts would not pay (the Challenge) is dropped with a notice, and the purchase goes on without it", async () => {
    const s = setup();
    open(`/play/challenge?ref=${ADDR.Challenge}`, s);
    expect(await screen.findByText(/This referral link cannot be used; buying without a referrer/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
    await userEvent.click(await enabledPay());
    await waitFor(() => expect(s.sent).toHaveLength(1));
    expect(BigInt(s.sent[0][1].calldata[1])).toBe(0n);
    expect(screen.queryByText("Purchase refused")).toBeNull();
  });

  it("an unknown outcome holds Pay until the games and USDC are read again, then offers Buy again only once the player confirms", async () => {
    const s = setup();
    const { router } = open("/play/challenge", s);
    const button = await enabledPay();
    s.state.noEvents = true;
    let release = () => {};
    s.state.balanceGate = new Promise<void>((r) => (release = r));
    await userEvent.click(button);
    expect(await screen.findByText("Outcome unknown", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    const held = await screen.findByRole("button", { name: "Checking your games…" });
    expect(held).toBeDisabled();
    await userEvent.click(held);
    expect(s.sent).toHaveLength(1);
    expect(router.state.location.pathname).toBe("/play/challenge");
    // The reads settle: a deliberate Buy again only.
    s.state.noEvents = false;
    s.state.balanceGate = null;
    release();
    // The receipt is still unknown after its re-checks: Pay stays held until the player confirms.
    expect(await screen.findByRole("button", { name: "Check your games first" }, { timeout: slow(3000) })).toBeDisabled();
    expect(screen.getByText(/Check your USDC balance and your games: confirm only if they show no purchase/)).toBeInTheDocument();
    await confirmNone();
    const again = await screen.findByRole("button", { name: "Buy again" }, { timeout: slow(3000) });
    await waitFor(() => expect(again).toBeEnabled());
    await userEvent.click(again);
    await waitFor(() => expect(s.sent).toHaveLength(2));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${GAME_ID}`));
  });

  it("Check my games opens the games after an unknown outcome", async () => {
    const s = setup();
    const { router } = open("/play/challenge", s);
    const button = await enabledPay();
    s.state.noEvents = true;
    await userEvent.click(button);
    await userEvent.click(await screen.findByRole("button", { name: "Check my games" }, { timeout: slow(3000) }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("an unread USDC balance is unknown, not 0: no Not enough USDC, Pay waits, Retry reads it again", async () => {
    const s = setup();
    s.state.balanceFail = "node down";
    open("/play/challenge", s);
    const why = await screen.findByText("Your USDC balance cannot be read", undefined, { timeout: slow(5000) });
    expect(screen.queryByText("Not enough USDC")).toBeNull();
    expect(await pay()).toBeDisabled();
    s.state.balanceFail = null;
    // The page's Retry (the header's balances, failed as well, have their own, #918).
    await userEvent.click(within(why.closest<HTMLElement>("[role=alert]")!).getByRole("button", { name: "Retry" }));
    await enabledPay();
    expect(screen.queryByText("Your USDC balance cannot be read")).toBeNull();
  });

  it("without an economy, why and Retry, with Back", async () => {
    const s = setup();
    s.sources.economy = null;
    open("/play/challenge", s);
    expect(await screen.findByText("The price cannot be read", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });
});

describe("/cobbles: the packs, a page of their own (#621)", () => {
  it("the Challenge's purchase shows the game alone: no tabs, no packs", async () => {
    const s = setup();
    open("/play/challenge", s);
    expect(await screen.findByRole("heading", { name: "Stake" }, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Challenge" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Cobble packs" })).toBeNull();
  });

  it("the old /play/challenge?tab=cobbles lands on /cobbles, its ?ref= kept", async () => {
    const s = setup();
    const { router } = open(`/play/challenge?tab=cobbles&ref=${REF}`, s);
    expect(await screen.findByRole("radiogroup", { name: "Cobble packs" }, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Cobbles" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/cobbles");
    expect(new URLSearchParams(router.state.location.search).get("ref")).toBe(REF);
    expect(new URLSearchParams(router.state.location.search).get("tab")).toBeNull();
  });

  it("shows the packs on sale from Setup.pack, with the price, the reference struck through and the discount", async () => {
    const s = setup();
    open("/cobbles", s);
    const group = await screen.findByRole("radiogroup", { name: "Cobble packs" }, { timeout: slow(3000) });
    const packs = within(group).getAllByRole("radio");
    expect(packs.map((p) => p.getAttribute("aria-label"))).toEqual([
      "50 Cobbles for $5, 50% off",
      "100 Cobbles for $9, 55% off",
      "500 Cobbles for $40, 60% off",
      "1000 Cobbles for $70, 65% off",
    ]);
    expect(within(packs[1]).getByText("$20")).toBeInTheDocument();
  });

  it("a pack bought with a referrer: approve Setup for its price, buy_pack(id, referrer, min_out), the balance from PackBought", async () => {
    const s = setup();
    open(`/cobbles?ref=${REF}`, s);
    await userEvent.click(await screen.findByRole("radio", { name: /100 Cobbles for \$9/ }, { timeout: slow(3000) }));
    await userEvent.click(await enabledPay(/Pay \$9 for/));
    expect(await screen.findByText("Pack bought", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    const [calls] = s.sent;
    expect(calls.map((c) => [c.contractAddress, c.entrypoint])).toEqual([[USDC, "approve"], [ADDR.Setup, "buy_pack"]]);
    expect(BigInt(calls[0].calldata[0])).toBe(BigInt(ADDR.Setup));
    expect(u256(calls[0].calldata[1], calls[0].calldata[2])).toBe(9_000_000n);
    expect(Number(calls[1].calldata[0])).toBe(2);
    expect(BigInt(calls[1].calldata[1])).toBe(BigInt(REF));
    // The swap takes the price less the 5 % referral.
    expect(s.pool.calls).toContain(8_550_000n);
    // 240 + 100, from the receipt.
    expect(await screen.findAllByRole("img", { name: "340 Cobbles" })).not.toHaveLength(0);
  });

  it("not enough USDC disables Buy, with the reason", async () => {
    const s = setup({ usdc: 6n * USDC_UNIT });
    open("/cobbles", s);
    await userEvent.click(await screen.findByRole("radio", { name: /1000 Cobbles/ }, { timeout: slow(3000) }));
    expect(await screen.findByText("Not enough USDC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pay \$70 for/ })).toBeDisabled();
  });

  it("refused: a pack off sale at send is shown, nothing moved", async () => {
    const s = setup({ revert: "Setup: pack not on sale" });
    open("/cobbles", s);
    await userEvent.click(await screen.findByRole("radio", { name: /50 Cobbles/ }, { timeout: slow(3000) }));
    await userEvent.click(await enabledPay(/Pay \$5 for/));
    expect(await screen.findByText("Purchase refused", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.getByText(/not on sale any more/)).toBeInTheDocument();
    expect(screen.queryByText("Pack bought")).toBeNull();
  });

  it("a price that changed since the confirm sends nothing and says so", async () => {
    const s = setup();
    open("/cobbles", s);
    await userEvent.click(await screen.findByRole("radio", { name: /50 Cobbles/ }, { timeout: slow(3000) }));
    const button = await enabledPay(/Pay \$5 for/);
    s.views.packs.set(1, { ...PACKS[0], price: 6_000_000n });
    await userEvent.click(button);
    expect(await screen.findByText("The price moved", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(s.sent).toEqual([]);
  });

  it("an unknown outcome holds Buy until the Cobbles and USDC are read again, then offers Buy again only once the player confirms", async () => {
    const s = setup();
    open("/cobbles", s);
    await userEvent.click(await screen.findByRole("radio", { name: /100 Cobbles for \$9/ }, { timeout: slow(3000) }));
    const button = await enabledPay(/Pay \$9 for/);
    s.state.noEvents = true;
    let release = () => {};
    s.state.balanceGate = new Promise<void>((r) => (release = r));
    await userEvent.click(button);
    expect(await screen.findByText("Outcome unknown", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check my Cobbles" })).toBeInTheDocument();
    const held = await screen.findByRole("button", { name: "Checking your Cobbles…" });
    expect(held).toBeDisabled();
    await userEvent.click(held);
    expect(s.sent).toHaveLength(1);
    s.state.noEvents = false;
    s.state.balanceGate = null;
    release();
    await confirmNone();
    const again = await screen.findByRole("button", { name: "Buy again" }, { timeout: slow(3000) });
    await waitFor(() => expect(again).toBeEnabled());
    await userEvent.click(again);
    await waitFor(() => expect(s.sent).toHaveLength(2));
    expect(await screen.findByText("Pack bought", undefined, { timeout: slow(3000) })).toBeInTheDocument();
  });

  it("the packs' read: loading, then the packs", async () => {
    const s = setup();
    let release = () => {};
    s.state.packsGate = new Promise<void>((r) => (release = r));
    open("/cobbles", s);
    expect(await screen.findByText("Reading the packs…", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    release();
    expect(await screen.findByRole("radiogroup", { name: "Cobble packs" }, { timeout: slow(3000) })).toBeInTheDocument();
  });

  it("a failed packs' read shows why, and Retry reads them again", async () => {
    const s = setup();
    s.views.cobblesFail = new Error("node down");
    open("/cobbles", s);
    const why = await screen.findByText("The packs cannot be read", undefined, { timeout: slow(5000) });
    s.views.cobblesFail = null;
    // The page's Retry (the header's balances, failed as well, have their own, #918).
    await userEvent.click(within(why.closest<HTMLElement>("[role=alert]")!).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("radiogroup", { name: "Cobble packs" }, { timeout: slow(3000) })).toBeInTheDocument();
  });

  it("no pack on sale: says so", async () => {
    const s = setup();
    s.views.packs.clear();
    open("/cobbles", s);
    expect(await screen.findByText("No packs on sale", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("a ?ref= the pack's split ignores (the Vault) is shown as no referrer, and sent as 0x0 with the whole price swapped", async () => {
    const s = setup();
    open(`/cobbles?ref=${ECON.vault}`, s);
    await userEvent.click(await screen.findByRole("radio", { name: /50 Cobbles/ }, { timeout: slow(3000) }));
    expect(await screen.findByText(/This referral link cannot be used/)).toBeInTheDocument();
    expect(screen.queryByText(/Your referrer gets/)).toBeNull();
    await userEvent.click(await enabledPay(/Pay \$5 for/));
    await waitFor(() => expect(s.sent).toHaveLength(1));
    expect(BigInt(s.sent[0][1].calldata[1])).toBe(0n);
    expect(s.pool.calls).toContain(5_000_000n);
    expect(s.pool.calls).not.toContain(4_750_000n);
  });

  it("a guest connects first", async () => {
    const s = setup({ signer: false });
    open("/cobbles", s);
    await userEvent.click(await screen.findByRole("radio", { name: /50 Cobbles/ }, { timeout: slow(3000) }));
    expect(screen.getByRole("button", { name: "Connect to buy" })).toBeEnabled();
  });
});

describe("the scene's selected pack (SC3's review note)", () => {
  it("is found among the packs shown: a selected pack without Cobbles is not offered, nothing divides by zero", () => {
    const empty = { packId: 9, cobbles: 0, price: 0n, active: true };
    const shop = { ...COBBLES.packs.cobbles, packs: [...COBBLES.packs.cobbles.packs, empty], selected: 9 };
    render(wrap(<CobblesScene {...COBBLES.packs} cobbles={shop} />));
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Pick a pack" })).toBeDisabled();
  });
});

describe("purchaseRefusal and referrerParam", () => {
  it("maps each typed error of the writers to the scene's refusal", () => {
    const kinds = [
      [new PoolPriceMovedError(10n, 9n), "quote-moved"],
      [new SwapBelowMinOutError("0x1"), "quote-moved"],
      [new PackRefusedError("price-moved", "0x1"), "quote-moved"],
      [new PackPriceChangedError(5n, 6n), "moved"],
      [new PackRefusedError("no-allowance", "0x1"), "moved"],
      [new WriteError("Another write is pending"), "busy"],
      [new PoolQuoteBelowFloorError(1n, 2n), "low-quote"],
      [new SpawnPausedError(), "paused"],
      [new PurchaseOutcomeUnknownError("0x1"), "unknown"],
      [new PackOutcomeUnknownError("0x1"), "unknown"],
      [new PackRefusedError("not-on-sale", "0x1"), "refused"],
      [new WriteError("Cannot read the price: node down"), "refused"],
      [new WalletRejectedError("User rejected the request"), "refused"],
    ] as const;
    for (const [error, kind] of kinds) expect(purchaseRefusal(error).kind, error.message).toBe(kind);
    expect(purchaseRefusal(new WriteError("Another write is pending")).message).toBe("Wait for your other transaction, then confirm again.");
    expect(purchaseRefusal(new PoolPriceMovedError(10n, 9n)).message).toMatch(/^The pool's quote moved: confirm again/);
    expect(purchaseRefusal(new WriteError("Cannot read the price: node down")).message).toBe("Cannot read the price: node down");
  });

  it("keeps an address that is not the player's own; drops anything else", () => {
    expect(referrerParam("0x0077", PLAYER)).toBe("0x77");
    expect(referrerParam(null, PLAYER)).toBeNull();
    expect(referrerParam("0x0", PLAYER)).toBeNull();
    expect(referrerParam("bob", PLAYER)).toBeNull();
    expect(referrerParam("0x05f1", PLAYER)).toBeNull();
    expect(referrerParam("0x5f1", null)).toBe("0x5f1");
  });
});

describe("an unknown outcome survives a remount, a reload and a failed check (review loop 2)", () => {
  it("Check my games, then back: still held, then Buy again only; nothing sent on a click while held", async () => {
    const s = setup();
    const { router } = await unknownGame(s);
    expect(localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"))).toContain('"hash":"0x1"');
    let release = () => {};
    s.state.receiptGate = new Promise<void>((r) => (release = r));
    await userEvent.click(await screen.findByRole("button", { name: "Check my games" }, { timeout: slow(3000) }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    // Home is shown: the purchase page has unmounted (a navigation keeps the old page until the new one has loaded).
    expect(await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: slow(5000) })).toBeInTheDocument();
    await act(() => router.navigate(-1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/challenge"));
    expect(await screen.findByText("Outcome unknown", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pay .* and play/ })).toBeNull();
    const held = await screen.findByRole("button", { name: "Checking your games…" });
    expect(held).toBeDisabled();
    await userEvent.click(held);
    expect(s.sent).toHaveLength(1);
    release();
    await confirmNone();
    const again = await screen.findByRole("button", { name: "Buy again" }, { timeout: slow(3000) });
    await waitFor(() => expect(again).toBeEnabled());
    expect(screen.queryByRole("button", { name: /Pay .* and play/ })).toBeNull();
    expect(s.sent).toHaveLength(1);
  });

  it("after a reload the stored record holds Pay: Outcome unknown and Buy again, no plain Pay", async () => {
    const s = setup();
    await unknownGame(s);
    reload(s);
    expect(await screen.findByText("Outcome unknown", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    await confirmNone();
    const again = await screen.findByRole("button", { name: "Buy again" }, { timeout: slow(3000) });
    await waitFor(() => expect(again).toBeEnabled());
    expect(screen.queryByRole("button", { name: /Pay .* and play/ })).toBeNull();
    expect(s.sent).toHaveLength(1);
    // Buy again is deliberate: it clears the record and sends.
    s.state.noEvents = false;
    await userEvent.click(again);
    await waitFor(() => expect(s.sent).toHaveLength(2));
    expect(localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"))).toBeNull();
  });

  it("the record is cleared once the receipt reads: it went through, and Pay is back", async () => {
    const s = setup();
    await unknownGame(s);
    s.state.receipts.set("0x1", "SUCCEEDED");
    reload(s);
    expect(await screen.findByText("Purchase went through", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"))).toBeNull());
    expect(await enabledPay()).toBeInTheDocument();
    expect(screen.queryByText("Outcome unknown")).toBeNull();
  });

  it("a reverted receipt clears the record too: nothing was spent", async () => {
    const s = setup();
    await unknownGame(s);
    s.state.receipts.set("0x1", "REVERTED");
    reload(s);
    expect(await screen.findByText(/did not go through: your USDC was not spent/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"))).toBeNull());
  });

  it("a failed check keeps the hold, with Retry", async () => {
    const s = setup();
    const opened = open("/play/challenge", s);
    void opened;
    const button = await enabledPay();
    s.state.noEvents = true;
    s.state.balanceFail = "node down";
    await userEvent.click(button);
    const held = await screen.findByRole("button", { name: "Could not check your games" }, { timeout: slow(5000) });
    expect(held).toBeDisabled();
    expect(screen.getByText(/It could not be checked: Retry/)).toBeInTheDocument();
    await userEvent.click(held);
    expect(s.sent).toHaveLength(1);
    s.state.balanceFail = null;
    s.state.noEvents = false;
    // The outcome's own Retry (the balance's notice has one too).
    const outcome = screen.getByText("Outcome unknown").closest("[role=status]") as HTMLElement;
    await userEvent.click(within(outcome).getByRole("button", { name: "Retry" }));
    await confirmNone();
    const again = await screen.findByRole("button", { name: "Buy again" }, { timeout: slow(3000) });
    await waitFor(() => expect(again).toBeEnabled());
  });

  it("the hold waits for the check's own USDC read: only that call gated, no early release", async () => {
    const s = setup();
    open("/play/challenge", s);
    const button = await enabledPay();
    s.state.noEvents = true;
    let release = () => {};
    s.state.balanceGate = new Promise<void>((r) => (release = r));
    // The next usdcBalance call after the send is the check's; only it waits.
    s.state.balanceGateAt = s.state.balanceCalls + 1;
    await userEvent.click(button);
    const held = await screen.findByRole("button", { name: "Checking your games…" }, { timeout: slow(3000) });
    // Other reads come and go meanwhile; the hold stays until the gated read answers.
    await new Promise((r) => setTimeout(r, 300));
    expect(held).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Buy again" })).toBeNull();
    release();
    await confirmNone();
    const again = await screen.findByRole("button", { name: "Buy again" }, { timeout: slow(3000) });
    await waitFor(() => expect(again).toBeEnabled());
  });

  it("a pack's unknown outcome survives a reload too", async () => {
    const s = setup();
    open("/cobbles", s);
    await userEvent.click(await screen.findByRole("radio", { name: /50 Cobbles/ }, { timeout: slow(3000) }));
    const button = await enabledPay(/Pay \$5 for/);
    s.state.noEvents = true;
    await userEvent.click(button);
    expect(await screen.findByText("Outcome unknown", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    reload(s, "/cobbles");
    expect(await screen.findByText("Outcome unknown", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    // The packs wait while the check runs; once it cannot tell, the player confirms, then picks.
    await confirmNone();
    await userEvent.click(await screen.findByRole("radio", { name: /50 Cobbles/ }, { timeout: slow(3000) }));
    expect(await screen.findByRole("button", { name: "Buy again" }, { timeout: slow(3000) })).toBeInTheDocument();
    expect(s.sent).toHaveLength(1);
  });

  it("a ?ref= that is Economy.seller() (read from the chain, not the deployment's Setup) is dropped with a notice, and sent as 0x0", async () => {
    const s = setup();
    const seller = "0x99";
    s.economy.seller_ = seller;
    open(`/play/challenge?ref=${seller}`, s);
    expect(await screen.findByText(/This referral link cannot be used/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
    await userEvent.click(await enabledPay());
    await waitFor(() => expect(s.sent).toHaveLength(1));
    expect(BigInt(s.sent[0][1].calldata[1])).toBe(0n);
  });

  it("a ?ref= the game's split ignores (the Vault) is dropped with a notice, and the game is bought with 0x0", async () => {
    const s = setup();
    open(`/play/challenge?ref=${ECON.vault}`, s);
    expect(await screen.findByText(/This referral link cannot be used/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
    await userEvent.click(await enabledPay());
    await waitFor(() => expect(s.sent).toHaveLength(1));
    expect(BigInt(s.sent[0][1].calldata[1])).toBe(0n);
    expect(s.pool.calls).not.toContain(1_900_000n);
  });
});

describe("an unknown outcome: the way out, the sender, the storage (review loop 3)", () => {
  /** Storage refuses the records' keys: `write` (full) or both `read` and `write` (off). */
  function refuseRecords(what: "write" | "read-write") {
    const isRecord = (key: string) => key.startsWith("paved:purchase-unknown:");
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (isRecord(key)) throw new DOMException("QuotaExceededError", "QuotaExceededError");
      return setItem.call(this, key, value);
    });
    if (what === "read-write") {
      const getItem = Storage.prototype.getItem;
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
        if (isRecord(key)) throw new DOMException("SecurityError", "SecurityError");
        return getItem.call(this, key);
      });
    }
  }

  /** A remount in the same session: the page gone and opened again, the app's cache kept. */
  function remount(s: ReturnType<typeof setup>) {
    document.body.innerHTML = "";
    return open("/play/challenge", s);
  }

  it("a check that keeps failing offers Dismiss, with its warning; Dismiss clears the record and Pay is back", async () => {
    const s = setup();
    s.state.receiptFail = "this node cannot read receipts";
    await unknownGame(s);
    expect(await screen.findByRole("button", { name: "Could not check your games" }, { timeout: slow(5000) })).toBeDisabled();
    expect(screen.getByText(/Dismiss only if you are sure it did not go through: buying again may pay twice/)).toBeInTheDocument();
    s.state.noEvents = false;
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"))).toBeNull());
    expect(await enabledPay()).toBeInTheDocument();
    expect(s.sent).toHaveLength(1);
  });

  it("a receipt that reads decides on its own: a failed read does not hide that it went through", async () => {
    const s = setup();
    await unknownGame(s);
    s.state.receipts.set("0x1", "SUCCEEDED");
    s.state.balanceFail = "node down";
    reload(s);
    expect(await screen.findByText("Purchase went through", undefined, { timeout: slow(5000) })).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"))).toBeNull());
  });

  it("stamps the record with the time of the send, not of the outcome", async () => {
    const s = setup();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <DataProvider sources={s.sources}>{children}</DataProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => usePurchase(PLAYER), { wrapper });
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000_000_000 });
    try {
      let release = () => {};
      s.state.gate = new Promise<void>((r) => (release = r));
      s.state.noEvents = true;
      act(() => result.current.mutation.mutate({ playerId: PLAYER, stake: 1, confirmedPrice: FAKE_UNIT, confirmedMinOut: 1n, referrer: null }));
      await vi.waitFor(() => expect(s.sent).toHaveLength(1));
      // The receipt comes 10 minutes later.
      vi.setSystemTime(1_000_000_600_000);
      release();
      await vi.waitFor(() => expect(localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"))).toContain('"hash":"0x1"'));
      expect(JSON.parse(localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"))!).at).toBe(1_000_000_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Retry fetching with an earlier answer in hand: the hold reports it, and the scene disables Retry and Dismiss", async () => {
    const s = setup();
    localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify({ hash: "0x1", at: Math.floor(Date.now() / 1000) }));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <DataProvider sources={s.sources}>{children}</DataProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => usePurchase(PLAYER).hold, { wrapper });
    // The first check reads an unknown receipt and every read: an answer, not a failure.
    await waitFor(() => expect(result.current.unknown?.hash).toBe("0x1"));
    await waitFor(() => expect(result.current.checking).toBe(false), { timeout: slow(3000) });
    expect(result.current.failed).toBe(false);
    // A later check fails (the answer in hand is kept under the error).
    s.state.receiptFail = "this node cannot read receipts";
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.failed).toBe(true), { timeout: slow(3000) });
    expect(result.current.retrying).toBe(false);
    // Retry: fetching, still failed until it answers.
    let release = () => {};
    s.state.receiptFail = null;
    s.state.receiptGate = new Promise<void>((r) => (release = r));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.retrying).toBe(true));
    expect(result.current.failed).toBe(true);
    release();
    await waitFor(() => expect(result.current.retrying).toBe(false), { timeout: slow(3000) });
    expect(result.current.failed).toBe(false);
  });

  it("the scene disables Retry and Dismiss while Retry is fetching", () => {
    const props = { ...PURCHASE.stake1, refusal: { kind: "unknown" as const, message: "Purchase sent." }, checkFailed: true, onRetryCheck: () => {}, onDismissCheck: () => {} };
    const { rerender } = render(wrap(<PurchaseScene {...props} />));
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeEnabled();
    rerender(wrap(<PurchaseScene {...props} checkRetrying />));
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
  });

  it("the scene offers Retry without Dismiss when the check is not dismissable (VALUE-POLISH 1)", () => {
    const props = { ...PURCHASE.stake1, refusal: { kind: "unknown" as const, message: "A purchase is waiting." }, checkFailed: true, onRetryCheck: () => {}, onDismissCheck: () => {} };
    render(wrap(<PurchaseScene {...props} checkDismissable={false} />));
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    expect(screen.getByText(/Dismiss is offered once your wallet's 5 minutes have passed/)).toBeInTheDocument();
  });

  it("says how long ago the purchase was sent, from the record's at", async () => {
    const s = setup();
    localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify({ hash: "0x1", at: Math.floor(Date.now() / 1000) - 300 }));
    open("/play/challenge", s);
    expect(await screen.findByText(/Purchase sent 5 min ago/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
  });

  it("the record goes under the sender: switch the signer while pending, then back, and the hold is the sender's", async () => {
    const s = setup();
    const other = s.client.writer({ address: "0xb0b", execute: async () => ({ transaction_hash: "0x99" }) });
    let current: DataSources = s.sources;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <DataProvider sources={current}>{children}</DataProvider>
      </QueryClientProvider>
    );
    const { result, rerender } = renderHook(({ player }: { player: string }) => usePurchase(player), { wrapper, initialProps: { player: PLAYER } });
    let release = () => {};
    s.state.gate = new Promise<void>((r) => (release = r));
    s.state.noEvents = true;
    act(() => result.current.mutation.mutate({ playerId: PLAYER, stake: 1, confirmedPrice: FAKE_UNIT, confirmedMinOut: 1n, referrer: null }));
    await waitFor(() => expect(s.sent).toHaveLength(1));
    // Another account connects while the send is pending.
    current = { ...s.sources, signer: other as unknown as GameSigner };
    rerender({ player: "0xb0b" });
    release();
    await waitFor(() => expect(localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"))).toContain('"hash":"0x1"'));
    expect(localStorage.getItem(unknownPurchaseStorageKey("0xb0b", "game"))).toBeNull();
    // The other account sees none of it.
    expect(result.current.hold.unknown).toBeNull();
    expect(result.current.mutation.status).toBe("idle");
    // Back to the sender: the hold is there.
    current = s.sources;
    rerender({ player: PLAYER });
    await waitFor(() => expect(result.current.hold.unknown?.hash).toBe("0x1"));
  });

  it("storage full: a failed write keeps the cache's copy, so a remount still holds", async () => {
    const s = setup();
    refuseRecords("write");
    await unknownGame(s);
    expect(localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"))).toBeNull();
    remount(s);
    expect(await screen.findByText("Outcome unknown", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pay .* and play/ })).toBeNull();
    // Another tab cannot read the record: the notice says so, and which tab holds Pay.
    expect(screen.getByText(/could not save the record: only this tab holds Pay, so do not buy from another tab/)).toBeInTheDocument();
  });

  it("a record that was saved does not carry the storage warning", async () => {
    const s = setup();
    await unknownGame(s);
    expect(screen.queryByText(/could not save the record/)).toBeNull();
  });

  it("storage off: the query cache keeps the record, so a remount still holds", async () => {
    const s = setup();
    refuseRecords("read-write");
    await unknownGame(s);
    remount(s);
    expect(await screen.findByText("Outcome unknown", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pay .* and play/ })).toBeNull();
  });

  it("a second tab's record (the storage event) holds this tab's Pay", async () => {
    const s = setup();
    open("/play/challenge", s);
    await enabledPay();
    const key = unknownPurchaseStorageKey(PLAYER, "game");
    localStorage.setItem(key, JSON.stringify({ hash: "0x7", at: Math.floor(Date.now() / 1000) }));
    act(() => void window.dispatchEvent(new StorageEvent("storage", { key })));
    expect(await screen.findByText("Outcome unknown", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.getByText("0x7")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pay .* and play/ })).toBeNull();
  });
});

describe("a pending send holds its sender's Pay across a change of player (arbitration, fix loop 4)", () => {
  /** The app on `s`, re-rendered on the same router with the signer given (null: a guest). */
  function openSwitchable(s: ReturnType<typeof setup>) {
    const router = createTestRouter("/play/challenge");
    const wallet = fakeWallet({ address: PLAYER });
    const view = render(<App router={router} sources={s.sources} connector={wallet.load} />);
    const as = (signer: GameSigner | null) => view.rerender(<App router={router} sources={{ ...s.sources, signer }} connector={wallet.load} />);
    return { router, as };
  }

  for (const via of ["a guest", "another account"] as const) {
    it(`switch away (${via}) and back while the send is pending: Pay stays disabled, nothing more is sent`, async () => {
      const s = setup();
      const other = s.client.writer({ address: "0xb0b", execute: async () => ({ transaction_hash: "0x99" }) });
      const { router, as } = openSwitchable(s);
      let release = () => {};
      s.state.gate = new Promise<void>((r) => (release = r));
      await userEvent.click(await enabledPay());
      await waitFor(() => expect(s.sent).toHaveLength(1));
      as(via === "a guest" ? null : (other as unknown as GameSigner));
      if (via === "a guest") expect(await screen.findByRole("button", { name: "Connect to buy" }, { timeout: slow(3000) })).toBeInTheDocument();
      as(s.writer as unknown as GameSigner);
      // Back to the sender, the send still pending: Pay is held.
      const held = await screen.findByRole("button", { name: /Confirm in your wallet/ }, { timeout: slow(3000) });
      expect(held).toBeDisabled();
      expect(screen.queryByRole("button", { name: /Pay .* and play/ })).toBeNull();
      await userEvent.click(held);
      expect(s.sent).toHaveLength(1);
      // The send lands: the hold lifts and Pay is offered again. (The page left by the switch no longer opens the board:
      // that per-send step went with the reset; the game is on Home.)
      release();
      await enabledPay();
      expect(router.state.location.pathname).toBe("/play/challenge");
      expect(s.sent).toHaveLength(1);
      // The game was bought: the page says it is ready, and opens it.
      expect(screen.getByText("Your game is ready")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Open game" }));
      expect(router.state.location.pathname).toBe(`/game/${GAME_ID}`);
    });

    it(`switch away (${via}) and back while a pack's send is pending: Buy stays disabled, nothing more is sent`, async () => {
      const s = setup();
      const other = s.client.writer({ address: "0xb0b", execute: async () => ({ transaction_hash: "0x99" }) });
      const router = createTestRouter("/cobbles");
      const wallet = fakeWallet({ address: PLAYER });
      const view = render(<App router={router} sources={s.sources} connector={wallet.load} />);
      const as = (signer: GameSigner | null) => view.rerender(<App router={router} sources={{ ...s.sources, signer }} connector={wallet.load} />);
      await userEvent.click(await screen.findByRole("radio", { name: /100 Cobbles for \$9/ }, { timeout: slow(3000) }));
      let release = () => {};
      s.state.gate = new Promise<void>((r) => (release = r));
      await userEvent.click(await enabledPay(/Pay \$9 for/));
      await waitFor(() => expect(s.sent).toHaveLength(1));
      as(via === "a guest" ? null : (other as unknown as GameSigner));
      if (via === "a guest") expect(await screen.findByRole("button", { name: "Connect to buy" }, { timeout: slow(3000) })).toBeInTheDocument();
      as(s.writer as unknown as GameSigner);
      const held = await screen.findByRole("button", { name: /Confirm in your wallet/ }, { timeout: slow(3000) });
      expect(held).toBeDisabled();
      expect(screen.queryByRole("button", { name: /Pay \$9 for/ })).toBeNull();
      await userEvent.click(held);
      expect(s.sent).toHaveLength(1);
      release();
      await waitFor(() => expect(screen.queryByRole("button", { name: /Confirm in your wallet/ })).toBeNull(), { timeout: slow(3000) });
      expect(s.sent).toHaveLength(1);
      expect(router.state.location.pathname).toBe("/cobbles");
    });
  }
});

describe("a wallet that never answers (writer timeout)", () => {
  function hook(s: ReturnType<typeof setup>) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <DataProvider sources={s.sources}>{children}</DataProvider>
      </QueryClientProvider>
    );
    return renderHook(() => usePurchase(PLAYER), { wrapper });
  }
  const request = { playerId: PLAYER, stake: 1, confirmedPrice: FAKE_UNIT, confirmedMinOut: 1n, referrer: null };
  /** The fake clock only moves by hand: let the pending promises settle. */
  const flush = async (until: () => boolean = () => false) => {
    for (let i = 0; i < 60 && !until(); i++) await act(() => vi.advanceTimersByTimeAsync(1));
  };
  /** A hung send, past its limit: the page has the timeout error. */
  async function timedOut(s: ReturnType<typeof setup>, result: ReturnType<typeof hook>["result"]) {
    let release = () => {};
    s.state.gate = new Promise<void>((r) => (release = r));
    act(() => result.current.mutation.mutate(request));
    await flush(() => s.sent.length === 1);
    expect(s.sent).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(PURCHASE_TIMEOUT_MS));
    await flush(() => result.current.mutation.status === "error");
    expect(result.current.mutation.error).toBeInstanceOf(PurchaseTimedOutError);
    return release;
  }

  it("rejects with the unknown outcome after the limit, and not before", async () => {
    const s = setup();
    const { result } = hook(s);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // The wallet's promise never settles.
      s.state.gate = new Promise<void>(() => {});
      act(() => result.current.mutation.mutate(request));
      // The writer reads its quotes before signing: let those settle (the fake clock only moves by hand).
      await flush(() => s.sent.length === 1);
      expect(s.sent).toHaveLength(1);
      await act(() => vi.advanceTimersByTimeAsync(PURCHASE_TIMEOUT_MS - 1));
      expect(result.current.mutation.status).toBe("pending");
      for (let i = 0; i < 20 && result.current.mutation.status === "pending"; i++) await act(() => vi.advanceTimersByTimeAsync(1));
      expect(result.current.mutation.status).toBe("error");
      const error = result.current.mutation.error!;
      expect(error).toBeInstanceOf(PurchaseTimedOutError);
      expect(purchaseRefusal(error)).toEqual({ kind: "unknown", message: expect.stringContaining("did not answer in 5 minutes") });
    } finally {
      vi.useRealTimers();
    }
  });

  it("Buy again is refused as busy while the hung send holds the writer, and works once it has answered", async () => {
    const s = setup();
    const { result } = hook(s);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const release = await timedOut(s, result);
      act(() => result.current.mutation.mutate(request));
      await flush(() => result.current.mutation.error !== null && !(result.current.mutation.error instanceof PurchaseTimedOutError));
      expect(purchaseRefusal(result.current.mutation.error!).kind).toBe("busy");
      expect(s.sent).toHaveLength(1);
      // The wallet answers at last: the send lands (its game is ready, which the page shows before any refusal) and the writer is free.
      s.state.gate = null;
      release();
      await flush(() => result.current.ready.gameId !== null);
      expect(result.current.ready.gameId).toBe(GAME_ID);
      expect(result.current.sending).toBe(false);
      act(() => result.current.mutation.mutate(request));
      await flush(() => s.sent.length === 2);
      expect(s.sent).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("an outcome-unknown hash that arrives after the limit is recorded, and Pay stays held on a remount", async () => {
    const s = setup();
    const { result, unmount } = hook(s);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let release = () => {};
    try {
      release = await timedOut(s, result);
      s.state.noEvents = true;
      release();
      // The timeout's hash-less hold is replaced by the late hash.
      await flush(() => localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"))?.includes('"hash":"0x1"') === true);
      expect(localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"))).toContain('"hash":"0x1"');
    } finally {
      vi.useRealTimers();
    }
    unmount();
    open("/play/challenge", s);
    expect(await screen.findByText("Outcome unknown", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pay .* and play/ })).toBeNull();
  });

  it("a success that arrives after the limit shows the game as ready, and clears the timed-out state", async () => {
    const s = setup();
    const { result } = hook(s);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const release = await timedOut(s, result);
      release();
      await flush(() => result.current.ready.gameId !== null);
      expect(result.current.ready.gameId).toBe(GAME_ID);
      await flush(() => result.current.mutation.status === "idle");
      expect(result.current.mutation.status).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a late refusal also clears the busy refusal that Buy again drew from the same send's hold", async () => {
    const s = setup();
    const { result } = hook(s);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const release = await timedOut(s, result);
      act(() => result.current.mutation.mutate(request));
      await flush(() => result.current.mutation.error !== null && !(result.current.mutation.error instanceof PurchaseTimedOutError));
      expect(purchaseRefusal(result.current.mutation.error!).kind).toBe("busy");
      s.state.gate = null;
      s.state.revert = "Challenge: spawn paused";
      release();
      await flush(() => result.current.mutation.status === "idle");
      expect(result.current.mutation.status).toBe("idle");
      expect(result.current.mutation.error).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a late answer clears only its own send's timeout: player A's does not clear player B's, B's own does", async () => {
    const s = setup();
    s.economy.setBalance("usdc", "0xb0b", 100n * USDC_UNIT);
    let releaseB = () => {};
    const bGate = new Promise<void>((r) => (releaseB = r));
    const other = s.client.writer({
      address: "0xb0b",
      execute: async (calls: Sent) => {
        s.sent.push(calls);
        await bGate;
        return { transaction_hash: "0xb2" };
      },
    });
    let current: DataSources = s.sources;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <DataProvider sources={current}>{children}</DataProvider>
      </QueryClientProvider>
    );
    const { result, rerender } = renderHook(({ player }: { player: string }) => usePurchase(player), { wrapper, initialProps: { player: PLAYER } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // A's send hangs and times out.
      let releaseA = () => {};
      s.state.gate = new Promise<void>((r) => (releaseA = r));
      act(() => result.current.mutation.mutate(request));
      await flush(() => s.sent.length === 1);
      await act(() => vi.advanceTimersByTimeAsync(PURCHASE_TIMEOUT_MS));
      await flush(() => result.current.mutation.status === "error");
      const aError = result.current.mutation.error as PurchaseTimedOutError;
      expect(aError).toBeInstanceOf(PurchaseTimedOutError);
      // The page switches to B, whose send hangs and times out too.
      current = { ...s.sources, signer: other as unknown as GameSigner };
      rerender({ player: "0xb0b" });
      await flush(() => result.current.mutation.status === "idle");
      act(() => result.current.mutation.mutate({ ...request, playerId: "0xb0b" }));
      await flush(() => s.sent.length === 2);
      expect(s.sent).toHaveLength(2);
      await act(() => vi.advanceTimersByTimeAsync(PURCHASE_TIMEOUT_MS));
      await flush(() => result.current.mutation.status === "error");
      const bError = result.current.mutation.error as PurchaseTimedOutError;
      expect(bError).toBeInstanceOf(PurchaseTimedOutError);
      expect(bError.sendId).not.toBe(aError.sendId);
      // A's late answer (a success, in A's cache) leaves B's state as it is.
      s.state.gate = null;
      releaseA();
      await flush(() => false);
      expect(result.current.mutation.error).toBe(bError);
      expect(result.current.mutation.status).toBe("error");
      // B's own late answer clears it.
      releaseB();
      await flush(() => result.current.mutation.status === "idle");
      expect(result.current.mutation.status).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the game a late success bought is kept for the sender however long the page is gone", async () => {
    const s = setup();
    const first = hook(s);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const release = await timedOut(s, first.result);
      release();
      await flush(() => first.result.current.ready.gameId !== null);
      first.unmount();
      // Longer than the query cache's default life (5 minutes) with no page watching it.
      await act(() => vi.advanceTimersByTimeAsync(30 * 60_000));
      const again = hook(s);
      expect(again.result.current.ready.gameId).toBe(GAME_ID);
      act(() => again.result.current.ready.clear());
      await flush(() => again.result.current.ready.gameId === null);
      expect(again.result.current.ready.gameId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a refusal that arrives after the limit clears the timed-out state", async () => {
    const s = setup();
    const { result } = hook(s);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const release = await timedOut(s, result);
      s.state.revert = "Challenge: spawn paused";
      release();
      await flush(() => result.current.mutation.status === "idle");
      expect(result.current.mutation.status).toBe("idle");
      expect(result.current.ready.gameId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a receipt that reads unknown keeps the hold: re-checks at 5 s, 10 s and 20 s, then Check again (VALUE-FIX 3)", () => {
  const stored = () => localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"));
  function hold(s: ReturnType<typeof setup>) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <DataProvider sources={s.sources}>{children}</DataProvider>
      </QueryClientProvider>
    );
    return renderHook(() => usePurchase(PLAYER).hold, { wrapper });
  }
  const flush = async (until: () => boolean) => {
    for (let i = 0; i < 100 && !until(); i++) await act(() => vi.advanceTimersByTimeAsync(1));
  };

  it("holds through the backoff, never offering Buy again, until the player confirms; Check again reads once more", async () => {
    setPurchaseRecheckForTests(null);
    expect(PURCHASE_RECHECK_MS).toEqual([5_000, 10_000, 20_000]);
    const s = setup();
    localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify({ hash: "0x1", at: Math.floor(Date.now() / 1000) }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const { result } = hold(s);
      await flush(() => s.state.receiptCalls === 1);
      // Each wait, then its re-check: the hold is `checking` throughout, never released.
      for (const [wait, calls] of [[5_000, 2], [10_000, 3], [20_000, 4]] as const) {
        expect(result.current).toMatchObject({ held: true, checking: true, unresolved: false, failed: false });
        await act(() => vi.advanceTimersByTimeAsync(wait - 100));
        expect(s.state.receiptCalls, `before the ${wait} ms re-check`).toBe(calls - 1);
        expect(result.current).toMatchObject({ held: true, checking: true, unresolved: false });
        await act(() => vi.advanceTimersByTimeAsync(100));
        await flush(() => s.state.receiptCalls === calls);
        expect(s.state.receiptCalls).toBe(calls);
      }
      // The backoff is bounded: no read after the third re-check, and the hold waits for the player.
      await flush(() => result.current.unresolved);
      expect(result.current).toMatchObject({ held: true, checking: false, unresolved: true, released: false });
      await act(() => vi.advanceTimersByTimeAsync(120_000));
      expect(s.state.receiptCalls).toBe(4);
      expect(stored()).toContain('"hash":"0x1"');
      // Check again: one more read, still held.
      act(() => result.current.checkAgain());
      await flush(() => s.state.receiptCalls === 5 && result.current.unresolved);
      expect(s.state.receiptCalls).toBe(5);
      expect(result.current.held).toBe(true);
      // The player confirms: Pay is released (Buy again), the record kept until that deliberate send.
      act(() => void result.current.confirmNone());
      expect(result.current).toMatchObject({ held: false, released: true, unresolved: false });
      expect(stored()).toContain('"hash":"0x1"');
    } finally {
      vi.useRealTimers();
    }
  });

  it("a definite answer during the backoff ends the hold: it went through, the record is cleared", async () => {
    setPurchaseRecheckForTests(null);
    const s = setup();
    localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify({ hash: "0x1", at: Math.floor(Date.now() / 1000) }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const { result } = hold(s);
      await flush(() => s.state.receiptCalls === 1);
      await act(() => vi.advanceTimersByTimeAsync(5_000));
      await flush(() => s.state.receiptCalls === 2);
      // The node sees it before the 10 s re-check.
      s.state.receipts.set("0x1", "SUCCEEDED");
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      await flush(() => result.current.resolved === "succeeded");
      expect(result.current).toMatchObject({ resolved: "succeeded", held: false, unknown: null });
      expect(stored()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the page: Outcome unknown, Pay held as Check your games first, Check again and It did not land; Buy again only after it", async () => {
    const s = setup();
    await unknownGame(s);
    const held = await screen.findByRole("button", { name: "Check your games first" }, { timeout: slow(3000) });
    expect(held).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Buy again" })).toBeNull();
    expect(screen.getByText(/the network does not know it yet/)).toBeInTheDocument();
    const before = s.state.receiptCalls;
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(s.state.receiptCalls).toBe(before + 1));
    expect(await screen.findByRole("button", { name: "Check your games first" }, { timeout: slow(3000) })).toBeDisabled();
    await confirmNone();
    expect(await screen.findByText(/You confirmed that it did not land/)).toBeInTheDocument();
    expect(await enabledPay(/^Buy again$/)).toBeInTheDocument();
    expect(s.sent).toHaveLength(1);
  });
});

describe("a send the wallet never answered holds Pay across a reconnect and a reload (VALUE-FIX 2)", () => {
  const stored = () => localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"));
  const request = { playerId: PLAYER, stake: 1, confirmedPrice: FAKE_UNIT, confirmedMinOut: 1n, referrer: null };
  const flush = async (until: () => boolean = () => false) => {
    for (let i = 0; i < 100 && !until(); i++) await act(() => vi.advanceTimersByTimeAsync(1));
  };
  /** The page's hook under `sources` (a reconnect swaps them), for the player connected in them. */
  function hook(initial: DataSources) {
    let current = initial;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <DataProvider sources={current}>{children}</DataProvider>
      </QueryClientProvider>
    );
    const rendered = renderHook(({ player }: { player: string | null }) => usePurchase(player), { wrapper, initialProps: { player: PLAYER as string | null } });
    const reconnect = (next: DataSources, player: string | null) => {
      current = next;
      rendered.rerender({ player });
    };
    return { ...rendered, reconnect };
  }
  /** Sends, and the wallet hangs past the limit: the hash-less hold is recorded under the sender. */
  async function timedOut(s: ReturnType<typeof setup>, result: ReturnType<typeof hook>["result"]) {
    let release = () => {};
    s.state.gate = new Promise<void>((r) => (release = r));
    act(() => result.current.mutation.mutate(request));
    await flush(() => s.sent.length === 1);
    await act(() => vi.advanceTimersByTimeAsync(PURCHASE_TIMEOUT_MS));
    await flush(() => result.current.mutation.status === "error");
    expect(result.current.mutation.error).toBeInstanceOf(PurchaseTimedOutError);
    expect(JSON.parse(stored()!)).toEqual({ hash: null, at: expect.any(Number), id: expect.any(String) });
    return release;
  }

  it("a timeout, then a reconnect (a new writer): Pay is held; then the late answer releases it", async () => {
    const s = setup();
    const { result, reconnect } = hook(s.sources);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const release = await timedOut(s, result);
      await flush(() => result.current.hold.unresolved);
      expect(result.current.hold).toMatchObject({ held: true, unresolved: true });
      // Disconnect, then connect again: a new writer, whose own pending flag knows nothing of the hung send.
      reconnect({ ...s.sources, signer: null }, null);
      await flush();
      const fresh = s.client.writer({ address: PLAYER, execute: async (calls: Sent) => (s.sent.push(calls), { transaction_hash: "0xf" }) });
      reconnect({ ...s.sources, signer: fresh as unknown as GameSigner }, PLAYER);
      await flush(() => result.current.hold.unknown !== null);
      expect(result.current.hold.unknown).toEqual({ hash: null, at: expect.any(Number), id: expect.any(String) });
      expect(result.current.hold.held).toBe(true);
      await flush(() => result.current.hold.unresolved);
      expect(result.current.hold.held).toBe(true);
      // The first send lands at last: its game is ready and the hold goes.
      s.state.gate = null;
      release();
      await flush(() => result.current.hold.unknown === null);
      expect(result.current.hold).toMatchObject({ unknown: null, held: false });
      expect(result.current.ready.gameId).toBe(GAME_ID);
      expect(stored()).toBeNull();
      expect(s.sent).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a late refusal releases it too (a late unknown hash replaces it: the writer-timeout tests above)", async () => {
    const s = setup();
    const { result } = hook(s.sources);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const release = await timedOut(s, result);
      s.state.gate = null;
      s.state.revert = "Challenge: spawn paused";
      release();
      await flush(() => stored() === null);
      expect(stored()).toBeNull();
      expect(result.current.hold.held).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a timeout, then a reload: the stored hold keeps Pay held; then the late answer releases it", async () => {
    const s = setup();
    const first = hook(s.sources);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    let release = () => {};
    try {
      release = await timedOut(s, first.result);
    } finally {
      vi.useRealTimers();
    }
    first.unmount();
    // The 5 minutes passed in real time too (the fake clock is gone): the record is older than the limit.
    const record = JSON.parse(stored()!) as { at: number };
    localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify({ ...record, at: record.at - PURCHASE_TIMEOUT_MS / 1000 - 1 }));
    // A reload: a fresh page and cache, the storage kept.
    queryClient.clear();
    open("/play/challenge", s);
    expect(await screen.findByText(/your wallet did not answer, so it may still go through/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Check your games first" }, { timeout: slow(3000) })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Pay .* and play/ })).toBeNull();
    expect(screen.getByText(/Check your USDC balance and your games: confirm only if they show no purchase/)).toBeInTheDocument();
    // The answer of the send (in a real reload it is the player's confirm that ends it; here the page saw it go).
    s.state.gate = null;
    release();
    await waitFor(() => expect(stored()).toBeNull(), { timeout: slow(3000) });
    expect(await enabledPay()).toBeInTheDocument();
    expect(s.sent).toHaveLength(1);
  });

  it("after a reload with no late answer, only the player's confirm releases Pay (after the reads of the USDC and the games)", async () => {
    const s = setup();
    localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify({ hash: null, at: Math.floor(Date.now() / 1000) - 600 }));
    const before = s.state.balanceCalls;
    open("/play/challenge", s);
    expect(await screen.findByText(/Purchase sent 10 min ago: your wallet did not answer/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Check your games first" }, { timeout: slow(3000) })).toBeDisabled();
    // The check read the USDC balance (and the games) before offering the confirm; no receipt is asked for.
    expect(s.state.balanceCalls).toBeGreaterThan(before);
    expect(s.state.receiptCalls).toBe(0);
    await confirmNone();
    const again = await enabledPay(/^Buy again$/);
    await userEvent.click(again);
    await waitFor(() => expect(s.sent).toHaveLength(1));
    await waitFor(() => expect(stored()).toBeNull());
  });

  it("6b: a late hash of send A never overwrites a newer send B's hold, even one sent in the same second", async () => {
    const s = setup();
    const { result } = hook(s.sources);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const release = await timedOut(s, result);
      const a = JSON.parse(stored()!) as { hash: null; at: number; id: string };
      // A later send B in the same second holds its own hash-less record (another tab): only its identity tells them apart.
      const b = { hash: null, at: a.at, id: `${a.id}-b` };
      writeUnknownPurchase(queryClient, PLAYER, "game", b);
      // A's late answer is an unknown outcome with a hash: B's hold stays.
      s.state.gate = null;
      s.state.noEvents = true;
      release();
      await flush(() => result.current.mutation.status !== "error" || s.state.receiptCalls > 0);
      await flush();
      expect(JSON.parse(stored()!)).toEqual(b);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a pack's timeout holds Buy the same way", async () => {
    localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "pack"), JSON.stringify({ hash: null, at: Math.floor(Date.now() / 1000) - PURCHASE_TIMEOUT_MS / 1000 - 1 }));
    const s = setup();
    open("/cobbles", s);
    expect(await screen.findByText(/your wallet did not answer/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(await screen.findByText(/Check your USDC balance and your Cobbles/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "It did not land" }, { timeout: slow(3000) })).toBeInTheDocument();
  });
});

describe("SESSION-NOAPPROVE (P-65): one prompt per paid entry; the hold written at send (VALUE-FIX's notes, 6b)", () => {
  const stored = (kind: "game" | "pack" = "game") => localStorage.getItem(unknownPurchaseStorageKey(PLAYER, kind));

  it("the paid entry is one execute of approve + spawn: the wallet prompts once, for both", async () => {
    const s = setup();
    open("/play/challenge", s);
    await userEvent.click(await enabledPay());
    await waitFor(() => expect(s.sent).toHaveLength(1));
    expect(s.sent[0].map((c) => [BigInt(c.contractAddress), c.entrypoint])).toEqual([[BigInt(USDC), "approve"], [BigInt(ADDR.Challenge), "spawn"]]);
  });

  it("a prompt the player declines is a refusal: it says so, holds nothing, and Pay is back", async () => {
    for (const declined of [() => undefined, () => new Error("User rejected the request"), () => ({ code: "CANCELED", message: "Canceled" })]) {
      cleanup();
      localStorage.clear();
      queryClient.clear();
      const s = setup();
      s.state.decline = declined;
      const { router } = open("/play/challenge", s);
      await userEvent.click(await enabledPay());
      const notice = await screen.findByRole("alert", undefined, { timeout: slow(3000) });
      expect(notice).toHaveTextContent("You declined in your wallet: nothing was sent.");
      expect(notice).not.toHaveTextContent(/Outcome unknown/);
      expect(stored()).toBeNull();
      expect(router.state.location.pathname).toBe("/play/challenge");
      s.state.decline = null;
      await userEvent.click(await enabledPay());
      await waitFor(() => expect(s.sent).toHaveLength(1));
    }
  });

  it("the hold is written when the send starts: a reload while the wallet's prompt is open still holds Pay", async () => {
    const s = setup();
    let release = () => {};
    s.state.gate = new Promise<void>((r) => (release = r));
    open("/play/challenge", s);
    await userEvent.click(await enabledPay());
    await waitFor(() => expect(s.sent).toHaveLength(1));
    // Before any answer and long before the 5-minute limit: the hash-less record is already there.
    expect(JSON.parse(stored()!)).toEqual({ hash: null, at: expect.any(Number), id: expect.any(String) });
    expect(screen.getByRole("button", { name: /Confirm in your wallet/ })).toBeInTheDocument();
    // A reload: the page gone, the send's promise still pending; the new page holds Pay, and says the prompt may be open.
    reload(s);
    expect(await screen.findByText(/A purchase is waiting in your wallet/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pay .* and play/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "It did not land" })).toBeNull();
    // The send's answer in time clears its own record.
    s.state.gate = null;
    release();
    await waitFor(() => expect(stored()).toBeNull(), { timeout: slow(3000) });
  });

  it("a second tab during an open prompt: the purchase waits in the wallet, Pay held, no It did not land until the limit passes", async () => {
    const s = setup();
    // The first tab's send, 10 s ago: its prompt may still be open.
    const young = { hash: null, at: Math.floor(Date.now() / 1000) - 10, id: "other-tab" };
    localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify(young));
    open("/play/challenge", s);
    expect(await screen.findByText(/A purchase is waiting in your wallet \(sent just now\)/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.queryByText(/your wallet did not answer/)).toBeNull();
    // The check's reads answer, and still no way to buy a second time while the prompt may be open.
    await waitFor(() => expect(s.state.balanceCalls).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole("button", { name: "It did not land" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pay .* and play/ })).toBeNull();
    expect(s.sent).toHaveLength(0);
    // Past the limit (the same send, read again after a reload): the usual text, and the confirm is offered.
    localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify({ ...young, at: young.at - PURCHASE_TIMEOUT_MS / 1000 }));
    reload(s);
    expect(await screen.findByText(/your wallet did not answer/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "It did not land" }, { timeout: slow(3000) })).toBeInTheDocument();
  });

  it("the open prompt's hold turns into the usual one when the limit passes, without a reload", async () => {
    const s = setup();
    // The limit passes when the test moves the clock, not after a real-time window: a 100 ms, then a 2 s window failed on a
    // loaded machine, which took longer than that to draw the page and opened it on the expired hold. The fake clock still
    // runs with real time (`shouldAdvanceTime`), so the page's own timers and the lookups' waits go on as usual.
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    try {
      // Sent from another tab 4 minutes ago: one minute left.
      localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify({ hash: null, at: (Date.now() - PURCHASE_TIMEOUT_MS + 60_000) / 1000, id: "other-tab" }));
      open("/play/challenge", s);
      expect(await screen.findByText(/A purchase is waiting in your wallet/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "It did not land" })).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(await screen.findByRole("button", { name: "It did not land" })).toBeInTheDocument();
      expect(screen.getByText(/your wallet did not answer/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a pack whose prompt the player declines: it says so and holds nothing", async () => {
    const s = setup();
    s.state.decline = () => undefined;
    open("/cobbles", s);
    await userEvent.click(await screen.findByRole("radio", { name: /100 Cobbles for \$9/ }, { timeout: slow(3000) }));
    await userEvent.click(await enabledPay(/Pay \$9 for/));
    expect(await screen.findByText("You declined in your wallet: nothing was sent.", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(stored("pack")).toBeNull();
    expect(s.sent).toHaveLength(0);
  });

  it("an answer in time clears the record written at send; a pack's too", async () => {
    const s = setup();
    open("/cobbles", s);
    await userEvent.click(await screen.findByRole("radio", { name: /100 Cobbles for \$9/ }, { timeout: slow(3000) }));
    await userEvent.click(await enabledPay(/Pay \$9 for/));
    expect(await screen.findByText("Pack bought", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    await waitFor(() => expect(s.sent).toHaveLength(1));
    await waitFor(() => expect(stored("pack")).toBeNull());
  });

  it("Buy again refused as busy keeps the earlier record: it goes only once a new send is accepted", async () => {
    const s = setup();
    const earlier = { hash: null, at: Math.floor(Date.now() / 1000) - 600 };
    localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify(earlier));
    open("/play/challenge", s);
    await confirmNone();
    const again = await enabledPay(/^Buy again$/);
    // The earlier send still holds the account's writer.
    let release = () => {};
    s.state.gate = new Promise<void>((r) => (release = r));
    const hung = s.writer.surrender({ mode: "challenge", gameId: 1 }).catch(() => undefined);
    await waitFor(() => expect(s.sent).toHaveLength(1));
    await userEvent.click(again);
    expect(await screen.findByText("Wait for your other transaction, then confirm again.", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(JSON.parse(stored()!)).toEqual(earlier);
    expect(s.sent).toHaveLength(1);
    s.state.gate = null;
    release();
    await hung;
  });

  it("a declined Buy again puts the earlier record back too: nothing was sent", async () => {
    const s = setup();
    const earlier = { hash: null, at: Math.floor(Date.now() / 1000) - 600 };
    localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify(earlier));
    open("/play/challenge", s);
    await confirmNone();
    const again = await enabledPay(/^Buy again$/);
    s.state.decline = () => new Error("User rejected the request");
    await userEvent.click(again);
    expect(await screen.findByText("You declined in your wallet: nothing was sent.", undefined, { timeout: slow(3000) })).toBeInTheDocument();
    expect(JSON.parse(stored()!)).toEqual(earlier);
  });
});

describe("VALUE-POLISH: the purchase-flow notes of #487", () => {
  const stored = () => localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"));
  const request = { playerId: PLAYER, stake: 1, confirmedPrice: FAKE_UNIT, confirmedMinOut: 1n, referrer: null };
  const flush = async (until: () => boolean = () => false) => {
    for (let i = 0; i < 100 && !until(); i++) await act(() => vi.advanceTimersByTimeAsync(1));
  };
  function hook(initial: DataSources) {
    let current = initial;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <DataProvider sources={current}>{children}</DataProvider>
      </QueryClientProvider>
    );
    const rendered = renderHook(() => usePurchase(PLAYER), { wrapper });
    const reconnect = (next: DataSources) => {
      current = next;
      rendered.rerender();
    };
    return { ...rendered, reconnect };
  }

  it("1: a failed check while the purchase may still be answered in the wallet offers Retry, not Dismiss", async () => {
    const s = setup();
    // Another tab's send, 10 s ago: its prompt may be open. The check's reads fail.
    const young = { hash: null, at: Math.floor(Date.now() / 1000) - 10, id: "other-tab" };
    localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify(young));
    s.state.balanceFail = "node down";
    open("/play/challenge", s);
    // Two Retry: the balance's own, and the check's beside the notice.
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(2), { timeout: slow(3000) });
    expect(screen.getByText(/A purchase is waiting in your wallet/)).toBeInTheDocument();
    expect(screen.getByText(/Dismiss is offered once your wallet's 5 minutes have passed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pay .* and play/ })).toBeNull();
    expect(JSON.parse(stored()!)).toEqual(young);
  });

  it("1: the hold's own Dismiss refuses while waiting, and clears once the limit has passed", async () => {
    const s = setup();
    s.state.balanceFail = "node down";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const young = { hash: null, at: Math.floor(Date.now() / 1000) - 10, id: "other-tab" };
      localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify(young));
      const { result } = hook(s.sources);
      await flush(() => result.current.hold.failed);
      expect(result.current.hold).toMatchObject({ failed: true, waiting: true, dismissable: false });
      let dismissed = true;
      act(() => void (dismissed = result.current.hold.dismissFailed()));
      expect(dismissed).toBe(false);
      expect(JSON.parse(stored()!)).toEqual(young);
      // Past the limit: the record is a send the wallet never answered, and Dismiss is the deliberate way out again.
      await act(() => vi.advanceTimersByTimeAsync(PURCHASE_TIMEOUT_MS));
      await flush(() => result.current.hold.dismissable);
      expect(result.current.hold).toMatchObject({ failed: true, waiting: false, dismissable: true });
      act(() => void (dismissed = result.current.hold.dismissFailed()));
      expect(dismissed).toBe(true);
      expect(stored()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("1: past the limit the page offers Dismiss beside Retry, with its warning", async () => {
    const s = setup();
    const old = { hash: null, at: Math.floor(Date.now() / 1000) - PURCHASE_TIMEOUT_MS / 1000 - 1, id: "old" };
    localStorage.setItem(unknownPurchaseStorageKey(PLAYER, "game"), JSON.stringify(old));
    s.state.balanceFail = "node down";
    open("/play/challenge", s);
    expect(await screen.findByRole("button", { name: "Dismiss" }, { timeout: slow(3000) })).toBeInTheDocument();
    expect(screen.getByText(/Dismiss only if you are sure it did not go through/)).toBeInTheDocument();
  });

  it("2: a wallet that fails after it may have sent (a timeout, a lost connection) keeps the hold; a refusal before sending does not", async () => {
    for (const lost of [() => new Error("fetch failed"), () => null, () => ({ code: 63, message: "An unexpected error occurred" })]) {
      cleanup();
      localStorage.clear();
      queryClient.clear();
      const s = setup();
      s.state.decline = lost;
      const { router } = open("/play/challenge", s);
      await userEvent.click(await enabledPay());
      expect(await screen.findByText(/Your wallet lost track of a purchase while sending it/, undefined, { timeout: slow(3000) })).toBeInTheDocument();
      expect(JSON.parse(stored()!)).toEqual({ hash: null, at: expect.any(Number), id: expect.any(String) });
      expect(screen.queryByRole("button", { name: /Pay .* and play/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "It did not land" })).toBeNull();
      expect(router.state.location.pathname).toBe("/play/challenge");
    }
    // The node's refusal before accepting it, a simulation's revert: nothing was sent, the hold goes, Pay is back.
    for (const refused of [() => ({ code: 41, message: "Transaction execution error" }), () => new Error("Fee estimation failed: insufficient balance")]) {
      cleanup();
      localStorage.clear();
      queryClient.clear();
      const s = setup();
      s.state.decline = refused;
      open("/play/challenge", s);
      await userEvent.click(await enabledPay());
      expect(await screen.findByText("Purchase refused", undefined, { timeout: slow(3000) })).toBeInTheDocument();
      expect(stored()).toBeNull();
      expect(await enabledPay()).toBeInTheDocument();
    }
  });

  it("2: purchaseRefusal reads a send that may have gone as an unknown outcome", () => {
    expect(purchaseRefusal(new SendUnconfirmedError("fetch failed"))).toEqual({ kind: "unknown", message: expect.stringContaining("may still go through") });
  });

  it("2: a late failure that may come after sending keeps a timed-out send's hold", async () => {
    const s = setup();
    let fail = (_error: unknown) => {};
    const writer = s.client.writer({
      address: PLAYER,
      execute: (calls: Sent) => (s.sent.push(calls), new Promise<{ transaction_hash: string }>((_resolve, reject) => (fail = reject))),
    });
    s.sources.signer = writer as unknown as GameSigner;
    const { result } = hook(s.sources);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      act(() => result.current.mutation.mutate(request));
      await flush(() => s.sent.length === 1);
      await act(() => vi.advanceTimersByTimeAsync(PURCHASE_TIMEOUT_MS));
      await flush(() => result.current.mutation.status === "error");
      expect(result.current.mutation.error).toBeInstanceOf(PurchaseTimedOutError);
      const held = JSON.parse(stored()!);
      fail(new Error("socket hang up"));
      await flush();
      expect(JSON.parse(stored()!)).toEqual(held);
      expect(result.current.hold.held).toBe(true);
      expect(result.current.mutation.error).toBeInstanceOf(PurchaseTimedOutError);
    } finally {
      vi.useRealTimers();
    }
  });

  it("3: a late hash of send A that arrives while B's prompt holds is kept, and checked when B is declined", async () => {
    const s = setup();
    const { result, reconnect } = hook(s.sources);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      // A: the wallet hangs past the limit; its hash-less hold stays.
      let releaseA = () => {};
      s.state.gate = new Promise<void>((r) => (releaseA = r));
      act(() => result.current.mutation.mutate(request));
      await flush(() => s.sent.length === 1);
      await act(() => vi.advanceTimersByTimeAsync(PURCHASE_TIMEOUT_MS));
      await flush(() => result.current.mutation.status === "error");
      expect(result.current.mutation.error).toBeInstanceOf(PurchaseTimedOutError);
      const a = JSON.parse(stored()!) as { hash: null; at: number; id: string };
      // The player reads their balance and games and confirms that A did not land; they reconnect (a new writer) and Buy again.
      await flush(() => result.current.hold.unresolved);
      act(() => void result.current.hold.confirmNone());
      expect(result.current.hold.released).toBe(true);
      let declineB = () => {};
      const declined = new Promise<void>((r) => (declineB = r));
      const writerB = s.client.writer({
        address: PLAYER,
        execute: async () => {
          await declined;
          throw { code: "CANCELED", message: "Canceled" };
        },
      });
      reconnect({ ...s.sources, signer: writerB as unknown as GameSigner });
      act(() => result.current.mutation.mutate(request));
      // B's prompt is open: its own hold has the slot.
      await flush(() => (JSON.parse(stored() ?? "{}") as { id?: string }).id !== a.id);
      const b = JSON.parse(stored()!) as { hash: null; id: string };
      expect(b).toMatchObject({ hash: null });
      expect(b.id).not.toBe(a.id);
      // A answers at last, with a hash whose outcome is unknown: B's hold stays, A's hash is kept aside.
      s.state.gate = null;
      s.state.noEvents = true;
      releaseA();
      await flush(() => localStorage.getItem(lateAnswerStorageKey(PLAYER, "game")) !== null);
      expect(JSON.parse(stored()!)).toEqual(b);
      expect(JSON.parse(localStorage.getItem(lateAnswerStorageKey(PLAYER, "game"))!)).toMatchObject({ id: a.id, record: { hash: "0x1" } });
      // B is declined: nothing was sent, and the slot goes back to A, with its late hash, not its hash-less record.
      declineB();
      await flush(() => result.current.mutation.error instanceof WalletRejectedError);
      expect(result.current.mutation.error).toBeInstanceOf(WalletRejectedError);
      expect(JSON.parse(stored()!)).toEqual({ hash: "0x1", at: a.at, id: a.id });
      expect(localStorage.getItem(lateAnswerStorageKey(PLAYER, "game"))).toBeNull();
      // A's receipt is checked: Pay is held again until it reads.
      await flush(() => s.state.receiptCalls > 0);
      expect(s.state.receiptCalls).toBeGreaterThan(0);
      expect(result.current.hold).toMatchObject({ held: true, released: false });
      s.state.receipts.set("0x1", "SUCCEEDED");
      act(() => result.current.hold.checkAgain());
      await flush(() => result.current.hold.resolved !== null);
      expect(result.current.hold.resolved).toBe("succeeded");
      expect(stored()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("3: a late hash of A while B holds surfaces when B settles too (B landed: A may have paid as well)", async () => {
    const s = setup();
    const { result } = hook(s.sources);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      let releaseA = () => {};
      s.state.gate = new Promise<void>((r) => (releaseA = r));
      act(() => result.current.mutation.mutate(request));
      await flush(() => s.sent.length === 1);
      await act(() => vi.advanceTimersByTimeAsync(PURCHASE_TIMEOUT_MS));
      await flush(() => result.current.mutation.status === "error");
      const a = JSON.parse(stored()!) as { hash: null; at: number; id: string };
      // B holds the slot (another tab).
      writeUnknownPurchase(queryClient, PLAYER, "game", { hash: null, at: a.at, id: "tab-b" });
      s.state.gate = null;
      s.state.noEvents = true;
      releaseA();
      await flush(() => localStorage.getItem(lateAnswerStorageKey(PLAYER, "game")) !== null);
      expect(JSON.parse(stored()!)).toMatchObject({ id: "tab-b" });
      // B lands: its hold goes, and A's hash takes the slot to be checked.
      writeUnknownPurchase(queryClient, PLAYER, "game", null);
      expect(JSON.parse(stored()!)).toEqual({ hash: "0x1", at: a.at, id: a.id });
    } finally {
      vi.useRealTimers();
    }
  });

  it("3: another tab that settled the late hash is seen: this tab's memory never brings it back", () => {
    // This tab: B (another tab's send) holds the slot; A's late hash arrives here and is kept aside.
    writeUnknownPurchase(queryClient, PLAYER, "game", { hash: null, at: 1, id: "tab-b" });
    recordOwnSend(queryClient, PLAYER, "game", { hash: "0xaa", at: 1, id: "a" });
    expect(localStorage.getItem(lateAnswerStorageKey(PLAYER, "game"))).not.toBeNull();
    // The other tab: B settles, A surfaces there, and A's receipt resolves it: both entries are gone from storage.
    localStorage.removeItem(lateAnswerStorageKey(PLAYER, "game"));
    localStorage.removeItem(unknownPurchaseStorageKey(PLAYER, "game"));
    // This tab: send C starts and settles. The slot empties and stays empty; A is not resurrected.
    writeUnknownPurchase(queryClient, PLAYER, "game", { hash: null, at: 2, id: "c" });
    writeUnknownPurchase(queryClient, PLAYER, "game", null);
    expect(currentRecord(queryClient, PLAYER, "game")).toBeNull();
    expect(localStorage.getItem(unknownPurchaseStorageKey(PLAYER, "game"))).toBeNull();
  });

  it("3: with storage refusing the aside, this tab's memory keeps it", () => {
    writeUnknownPurchase(queryClient, PLAYER, "game", { hash: null, at: 1, id: "tab-b" });
    const setItem = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === lateAnswerStorageKey(PLAYER, "game")) throw new Error("QuotaExceededError");
      return setItem.call(this, key, value);
    });
    recordOwnSend(queryClient, PLAYER, "game", { hash: "0xaa", at: 1, id: "a" });
    spy.mockRestore();
    expect(localStorage.getItem(lateAnswerStorageKey(PLAYER, "game"))).toBeNull();
    writeUnknownPurchase(queryClient, PLAYER, "game", null);
    expect(currentRecord(queryClient, PLAYER, "game")).toEqual({ hash: "0xaa", at: 1, id: "a" });
  });

  it("3: a late success of A while B holds: if B is declined, A's record does not come back", async () => {
    const s = setup();
    const { result } = hook(s.sources);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      let releaseA = () => {};
      s.state.gate = new Promise<void>((r) => (releaseA = r));
      act(() => result.current.mutation.mutate(request));
      await flush(() => s.sent.length === 1);
      await act(() => vi.advanceTimersByTimeAsync(PURCHASE_TIMEOUT_MS));
      await flush(() => result.current.mutation.status === "error");
      const a = JSON.parse(stored()!) as { hash: null; at: number; id: string };
      writeUnknownPurchase(queryClient, PLAYER, "game", { hash: null, at: a.at, id: "tab-b" });
      s.state.gate = null;
      releaseA();
      await flush(() => result.current.ready.gameId !== null);
      expect(result.current.ready.gameId).toBe(GAME_ID);
      expect(JSON.parse(stored()!)).toMatchObject({ id: "tab-b" });
      // B sent nothing and gives the slot back to A's record: A is over, so the slot empties.
      writeUnknownPurchase(queryClient, PLAYER, "game", a);
      expect(stored()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
