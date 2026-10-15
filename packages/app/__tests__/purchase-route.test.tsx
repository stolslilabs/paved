import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hash } from "starknet";
import {
  PackOutcomeUnknownError,
  PackPriceChangedError,
  PackRefusedError,
  PoolPriceMovedError,
  PoolQuoteBelowFloorError,
  PurchaseOutcomeUnknownError,
  SpawnPausedError,
  SwapBelowMinOutError,
  WriteError,
  PavedClient,
  createCodecs, createEconomyClient, packBuyerOf, resolveDeployment, resolveEconomyDeployment, type PavedRpc, type PavedWriter } from "@paved/chain";
import { FAKE_CHAIN_ID, FAKE_ROUTER_FILE, FAKE_UNIT } from "@paved/chain/testing";
import { App } from "../src/App";
import { PurchaseScene } from "../src/components/scenes/purchase-scene";
import type { GameSigner } from "../src/data";
import { purchaseRefusal, referrerParam } from "../src/data/purchase";
import { queryClient } from "../src/lib/query-client";
import { PURCHASE } from "../src/mocks/scenes";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";

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
  /** While set, the account waits for it before answering: the page's pending state. */
  const state: { gate: Promise<void> | null; revert: string | null } = { gate: null, revert: options.revert ?? null };
  const account = {
    address: PLAYER,
    execute: async (calls: Sent) => {
      sent.push(calls);
      if (state.gate) await state.gate;
      return { transaction_hash: `0x${sent.length.toString(16)}` };
    },
  };
  /** The receipt of the last send: `GameSpawned` for a spawn, `PackBought` for a pack (the fake ledger follows it). */
  const receipt = async () => {
    if (state.revert) return { execution_status: "REVERTED", revert_reason: `Failure reason: '${state.revert}'.` };
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
  const rpc = { callContract: async () => [], getChainId: async () => FAKE_CHAIN_ID, getEvents: async () => ({ events: [] }), waitForTransaction: receipt } as unknown as PavedRpc;
  const base = resolveDeployment({ network: "devnet", file: FAKE_ROUTER_FILE, env: { rpcUrl: "http://x", addresses: ADDR } });
  const client = new PavedClient({ ...base, chainId: FAKE_CHAIN_ID }, rpc, createCodecs(), views);
  const econ = createEconomyClient(resolveEconomyDeployment({ base: { ...base, chainId: FAKE_CHAIN_ID }, file: FAKE_ROUTER_FILE, env: ECON }), client, economy, pool)!;
  const writer = client.writer(account);
  fakes.sources.signer = options.signer === false ? null : (writer as unknown as GameSigner);
  fakes.sources.purchases = (signer) => ({
    purchase: (request) => econ.writer(signer as unknown as PavedWriter).purchase(request),
    buyPack: (request) => packBuyerOf(econ, signer as unknown as PavedWriter).buy(request),
  });
  return { ...fakes, sent, state, writer };
}

function open(path: string, s: ReturnType<typeof setup>, wallet = fakeWallet({ address: PLAYER })) {
  const router = createTestRouter(path);
  render(<App router={router} sources={s.sources} connector={wallet.load} />);
  return { router, wallet };
}

const pay = (name: RegExp = /Pay .* and play/) => screen.findByRole("button", { name }, { timeout: 3000 });
/** Pay, once the pool's quote has been read (the button waits for `min_out`). */
async function enabledPay(name?: RegExp) {
  const button = await pay(name);
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}
const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const u256 = (low: string, high: string) => BigInt(low) + (BigInt(high) << 128n);

beforeEach(() => {
  queryClient.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => resetWelcomedForTests());

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

  it("sends the referrer of ?ref=, which keeps the 5 % out of the swap", async () => {
    const s = setup();
    open(`/play/challenge?ref=${REF}`, s);
    await userEvent.click(await enabledPay());
    await waitFor(() => expect(s.sent).toHaveLength(1));
    expect(BigInt(s.sent[0][1].calldata[1])).toBe(BigInt(REF));
    expect(s.pool.calls.at(-1)).toBe(1_900_000n);
  });

  it("a guest connects first: Pay is Connect to buy", async () => {
    const s = setup({ signer: false });
    const { wallet } = open("/play/challenge", s);
    await userEvent.click(await screen.findByRole("button", { name: "Connect to buy" }, { timeout: 3000 }));
    await waitFor(() => expect(wallet.calls).toContain("connect"));
    expect(s.sent).toEqual([]);
  });

  it("paused: Pay is disabled and says why", async () => {
    const s = setup();
    s.views.paused = true;
    open("/play/challenge", s);
    expect(await screen.findByText("Purchases paused", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(await pay()).toBeDisabled();
  });

  it("not enough USDC: Pay is disabled and says why", async () => {
    const s = setup({ usdc: 1n * USDC_UNIT });
    open("/play/challenge", s);
    expect(await screen.findByText("Not enough USDC", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(await pay()).toBeDisabled();
  });

  it("a quote that moved since the confirm sends nothing, says so, and the next confirm takes the new min_out", async () => {
    const s = setup();
    open("/play/challenge", s);
    const button = await enabledPay();
    // Down 2.5 %: below the confirmed min_out, still above the guard rate's floor (90 %).
    s.pool.rate = { paved: 78n * 10n ** 18n, usdc: USDC_UNIT };
    await userEvent.click(button);
    expect(await screen.findByText("The price moved", undefined, { timeout: 3000 })).toBeInTheDocument();
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
    const notice = await screen.findByRole("alert", undefined, { timeout: 3000 });
    expect(notice).toHaveTextContent(/paused/);
    expect(router.state.location.pathname).toBe("/play/challenge");
  });

  it("an unknown referrer address is refused by the writer: Purchase refused, nothing sent", async () => {
    const s = setup();
    open(`/play/challenge?ref=${ADDR.Challenge}`, s);
    await userEvent.click(await enabledPay());
    expect(await screen.findByText("Purchase refused", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/cannot be your referrer/)).toBeInTheDocument();
    expect(s.sent).toEqual([]);
  });

  it("without an economy, why and Retry, with Back", async () => {
    const s = setup();
    s.sources.economy = null;
    open("/play/challenge", s);
    expect(await screen.findByText("The price cannot be read", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });
});

describe("/play/challenge?tab=cobbles: the packs", () => {
  it("shows the packs on sale from Setup.pack, with the price, the reference struck through and the discount", async () => {
    const s = setup();
    open("/play/challenge?tab=cobbles", s);
    const group = await screen.findByRole("radiogroup", { name: "Cobble packs" }, { timeout: 3000 });
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
    open(`/play/challenge?tab=cobbles&ref=${REF}`, s);
    await userEvent.click(await screen.findByRole("radio", { name: /100 Cobbles for \$9/ }, { timeout: 3000 }));
    await userEvent.click(await enabledPay(/Pay \$9 for/));
    expect(await screen.findByText("Pack bought", undefined, { timeout: 3000 })).toBeInTheDocument();
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
    open("/play/challenge?tab=cobbles", s);
    await userEvent.click(await screen.findByRole("radio", { name: /1000 Cobbles/ }, { timeout: 3000 }));
    expect(await screen.findByText("Not enough USDC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pay \$70 for/ })).toBeDisabled();
  });

  it("refused: a pack off sale at send is shown, nothing moved", async () => {
    const s = setup({ revert: "Setup: pack not on sale" });
    open("/play/challenge?tab=cobbles", s);
    await userEvent.click(await screen.findByRole("radio", { name: /50 Cobbles/ }, { timeout: 3000 }));
    await userEvent.click(await enabledPay(/Pay \$5 for/));
    expect(await screen.findByText("Purchase refused", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/not on sale any more/)).toBeInTheDocument();
    expect(screen.queryByText("Pack bought")).toBeNull();
  });

  it("a price that changed since the confirm sends nothing and says so", async () => {
    const s = setup();
    open("/play/challenge?tab=cobbles", s);
    await userEvent.click(await screen.findByRole("radio", { name: /50 Cobbles/ }, { timeout: 3000 }));
    const button = await enabledPay(/Pay \$5 for/);
    s.views.packs.set(1, { ...PACKS[0], price: 6_000_000n });
    await userEvent.click(button);
    expect(await screen.findByText("The price moved", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(s.sent).toEqual([]);
  });

  it("a guest connects first", async () => {
    const s = setup({ signer: false });
    open("/play/challenge?tab=cobbles", s);
    await userEvent.click(await screen.findByRole("radio", { name: /50 Cobbles/ }, { timeout: 3000 }));
    expect(screen.getByRole("button", { name: "Connect to buy" })).toBeEnabled();
  });
});

describe("the scene's selected pack (SC3's review note)", () => {
  it("is found among the packs shown: a selected pack without Cobbles is not offered, nothing divides by zero", () => {
    const empty = { packId: 9, cobbles: 0, price: 0n, active: true };
    const shop = { ...PURCHASE.cobblePacks.cobbles, packs: [...PURCHASE.cobblePacks.cobbles.packs, empty], selected: 9 };
    render(wrap(<PurchaseScene {...PURCHASE.cobblePacks} cobbles={shop} />));
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Pick a pack" })).toBeDisabled();
  });
});

describe("purchaseRefusal and referrerParam", () => {
  it("maps each typed error of the writers to the scene's refusal", () => {
    const kinds = [
      [new PoolPriceMovedError(10n, 9n), "moved"],
      [new SwapBelowMinOutError("0x1"), "moved"],
      [new PackPriceChangedError(5n, 6n), "moved"],
      [new PackRefusedError("price-moved", "0x1"), "moved"],
      [new PackRefusedError("no-allowance", "0x1"), "moved"],
      [new PoolQuoteBelowFloorError(1n, 2n), "low-quote"],
      [new SpawnPausedError(), "paused"],
      [new PurchaseOutcomeUnknownError("0x1"), "unknown"],
      [new PackOutcomeUnknownError("0x1"), "unknown"],
      [new PackRefusedError("not-on-sale", "0x1"), "refused"],
      [new WriteError("Another write is pending"), "refused"],
    ] as const;
    for (const [error, kind] of kinds) expect(purchaseRefusal(error).kind, error.name).toBe(kind);
    expect(purchaseRefusal(new WriteError("Another write is pending")).message).toBe("Another write is pending");
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
