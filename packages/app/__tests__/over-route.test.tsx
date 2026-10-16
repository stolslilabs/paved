import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "starknet";
import {
  PavedClient,
  SettleTooEarlyError,
  WriteError,
  createCodecs,
  createEconomyClient,
  resolveDeployment,
  resolveEconomyDeployment,
  settlesAfter as chainSettlesAfter,
  type PavedRpc,
  type WriteResult,
} from "@paved/chain";
import { FAKE_CHAIN_ID, FAKE_ROUTER_FILE, fakeTerms } from "@paved/chain/testing";
import { App } from "../src/App";
import type { DataSources, GameSigner, Settlements } from "../src/data";
import { settlementsFor } from "../src/data/settle-client";
import { DAY_SECONDS, replayClosings, rewardOf, settlesAfter, thresholdOf } from "../src/data/over";
import { queryKeys } from "../src/data/keys";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { holdGame, playedGame } from "./over-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// `/game/:gameId/over` (P7a) on `@paved/chain`'s fakes: `FakeGameViews` for the game and its tiles, `FakeEconomy` for the
// terms and the day, the fixture indexer for the record, and a settlement that records what it is asked to send.

const PLAYER = "0x5f1";
const OTHER = "0x6a2";
const GAME_ID = 9;
const PAVED = 10n ** 18n;
/** Chain days: the game's day, and its place against the real clock (`useNow`): settleable from the end of the next day. */
const TODAY = Math.floor(Date.now() / 1000 / DAY_SECONDS);
const OPEN_DAY = TODAY;
const READY_DAY = TODAY - 2;

const played = playedGame(GAME_ID, PLAYER);

type Fakes = ReturnType<typeof fakeSources>;

interface Options {
  terms?: Parameters<typeof fakeTerms>[0] | null;
  /** The indexer's record of the game; none answers 404. */
  indexed?: Record<string, unknown> | null;
  viewer?: string | "guest";
  settle?: Settlements["settle"];
  day?: { closed: boolean; mean?: number };
  game?: Partial<typeof played.game>;
  noGame?: boolean;
}

function row(fields: Record<string, unknown> = {}) {
  return {
    contract: "challenge", game_id: GAME_ID, player_id: PLAYER, mode: 1, start_time: 1000, day_id: 0, over: true, score: played.game.score,
    counted_day_id: 0, end_time: 1600, token_id: null, free: false, ...fields,
  };
}

function setup(options: Options = {}) {
  const f: Fakes = fakeSources();
  if (!options.noGame) holdGame(f.views, { ...played, game: { ...played.game, ...options.game } });
  if (options.terms !== null) f.economy.terms_.set(GAME_ID, fakeTerms({ stake: 3, day: READY_DAY, player: PLAYER, score: played.game.score, ...options.terms }));
  const terms = f.economy.terms_.get(GAME_ID);
  if (terms && options.day) f.economy.days.set(terms.day, { prior: 0, sum: 0n, weight: 0, mean: options.day.mean ?? 0, closed: options.day.closed });
  f.fixture.games = options.indexed === null ? [] : [row(options.indexed ?? {}) as never];
  const settle = vi.fn(options.settle ?? (async (): Promise<WriteResult & { noReward: number[] }> => ({ transactionHash: "0x1", events: [], noReward: [] })));
  const settlements = vi.fn((): Settlements => ({ settle }));
  const viewer = options.viewer ?? PLAYER;
  const signer = viewer === "guest" ? null : ({ address: viewer } as unknown as GameSigner);
  const sources: DataSources = { ...f.sources, signer, settlements };
  return { ...f, sources, settle, settlements };
}

function open(path: string, s: ReturnType<typeof setup>, wallet = fakeWallet({ address: PLAYER })) {
  const router = createTestRouter(path);
  render(<App router={router} sources={s.sources} connector={wallet.load} />);
  return { router, wallet };
}

const over = (s: ReturnType<typeof setup>, ref = "") => open(`/game/${GAME_ID}/over${ref}`, s);
const reward = () => screen.findByRole("region", { name: "Reward" }, { timeout: 5000 });
const settleButton = () => screen.queryByRole("button", { name: /Settle and claim/ });

// The board a route opens is not under test here (this file asserts the route it opens; `challenge-route.test.tsx` runs the board):
// a stand-in keeps the renderer and three out of its first test.
vi.mock("../src/routes/pages/board", async () => (await import("./route-helpers")).boardStandInModule);
preloadPages("over", "home", "purchase");

beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  resetWelcomedForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("/game/:gameId/over (P7a)", () => {
  it("shows the final score and the counters from game(id) and every closing of the game from its tiles", async () => {
    const s = setup({ terms: { settled: true, reward: 8n * PAVED }, indexed: { economy: null } });
    over(s);
    expect(await screen.findByTestId("score-value", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Final score" })).toBeInTheDocument();
    expect(screen.getByText(`Challenge #${GAME_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId("score-value")).toHaveTextContent(played.game.score.toLocaleString("en-US").replace(",", " "));
    const metrics = screen.getByRole("region", { name: "Game metrics" });
    expect(within(metrics).getByText("Tiles placed").closest("div")).toHaveTextContent(String(played.game.placedCount));
    // Every closing the moves scored, in move order, as the engine counted them.
    const list = within(await screen.findByRole("region", { name: "Closings" })).getAllByRole("listitem");
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Closings" })).getAllByRole("listitem")).toHaveLength(played.closings.length));
    expect(list.length).toBeGreaterThan(0);
    expect(s.views.calls).toEqual(expect.arrayContaining([`game challenge:${GAME_ID}`, `tiles challenge:${GAME_ID}`, `initial_seed challenge:${GAME_ID}`]));
    for (const [i, li] of within(screen.getByRole("region", { name: "Closings" })).getAllByRole("listitem").entries()) {
      expect(li).toHaveTextContent(`tile ${played.closings[i]!.tileId}`);
      expect(li).toHaveTextContent(`${played.closings[i]!.size} tiles`);
    }
  });

  describe("the reward", () => {
    it("settled above the threshold: the PAVED minted and the threshold it beat", async () => {
      const s = setup({ terms: { settled: true, reward: 8_420_000_000_000_000_000n }, indexed: { economy: economyRow({ settled: true, threshold: 1_000, reward: "8420000000000000000" }) } });
      over(s);
      const panel = await reward();
      expect(panel).toHaveAttribute("data-state", "rewarded");
      expect(panel).toHaveTextContent("8.42");
      expect(panel).toHaveTextContent(/Threshold\s*1\s*·\s*beaten by/);
      expect(settleButton()).toBeNull();
      expect(screen.getByText("Already settled.")).toBeInTheDocument();
    });

    it("settled below the threshold: no reward, the stake is lost, and the threshold it missed", async () => {
      const threshold = (played.game.score + 500) * 1_000;
      const s = setup({ terms: { settled: true, reward: 0n }, indexed: { economy: economyRow({ settled: true, threshold, reward: "0" }) } });
      over(s);
      const panel = await reward();
      expect(panel).toHaveAttribute("data-state", "below");
      expect(panel).toHaveTextContent("Below the threshold the stake is lost.");
      expect(panel).toHaveTextContent("missed by 500");
    });

    it("expired: no reward, with the 24 h deadline of terms.time + 86400", async () => {
      const day = READY_DAY;
      const s = setup({ terms: { expired: true, day }, indexed: { economy: null } });
      over(s);
      const panel = await reward();
      expect(panel).toHaveAttribute("data-state", "expired");
      const sentence = screen.getByText(/The 24 h/);
      expect(sentence).toHaveTextContent(/The 24 h ended .* ago \(.* UTC\)\./);
      const deadline = sentence.querySelector("time")!;
      expect(deadline.getAttribute("dateTime")).toBe(new Date((day * DAY_SECONDS + DAY_SECONDS) * 1000).toISOString());
      // Nothing to claim: no settle control.
      expect(screen.queryByRole("region", { name: "Settle" })).toBeNull();
    });

    it("a free game: the label Free game, and no reward and no settle", async () => {
      const s = setup({ terms: null, indexed: { free: true } });
      over(s);
      const panel = await reward();
      expect(panel).toHaveAttribute("data-state", "free-game");
      expect(panel).toHaveTextContent("Free game");
      expect(screen.getAllByText("Free game").length).toBeGreaterThanOrEqual(2);
      expect(screen.queryByRole("region", { name: "Settle" })).toBeNull();
      expect(settleButton()).toBeNull();
      expect(screen.queryByText(/Threshold/)).toBeNull();
    });

    it("a game the economy never sold (stake 0) is free whatever the indexer says", async () => {
      const s = setup({ terms: { stake: 0 }, indexed: null });
      over(s);
      expect(await reward()).toHaveAttribute("data-state", "free-game");
    });

    it("no terms and not marked free (no economy, or a free game not indexed yet): a neutral line, never Training's copy", async () => {
      const s = setup({ terms: null, indexed: null });
      // A build with no economy deployment: the economy's reads answer null.
      s.sources.economy = null;
      over(s);
      expect(await screen.findByText("Reward unavailable", {}, { timeout: 5000 })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Reward" })).toBeNull();
      expect(screen.queryByText(/Training plays for practice/)).toBeNull();
      expect(screen.queryByRole("region", { name: "Settle" })).toBeNull();
    });

    it("recorded, its day closed: the threshold from the day's mean and the game's sigma, before any settle", async () => {
      const s = setup({ terms: { sigmaBps: 500 }, day: { closed: true, mean: 1_000_000 }, indexed: null });
      over(s);
      const panel = await reward();
      expect(panel).toHaveAttribute("data-state", "awaiting");
      // 1,000,000 x (10,000 + 500) / 10,000 = 1,050,000 milli-points: 1,050 points.
      expect(panel).toHaveTextContent(/Threshold\s*1\s*050/);
    });
  });

  describe("settle", () => {
    it("until the end of the next day: Settles in <time> (<date> UTC), no button", async () => {
      // Only Date is faked: 14 h 05 min before the settle time, whatever day the test runs.
      vi.useFakeTimers({ toFake: ["Date"], now: (settlesAfter(OPEN_DAY) - 14 * 3600 - 5 * 60) * 1000 });
      const s = setup({ terms: { day: OPEN_DAY } });
      over(s);
      const area = await screen.findByRole("region", { name: "Settle" }, { timeout: 5000 });
      expect(area).toHaveTextContent(/Settles in 14 h 05 min \(\w{3}, \w{3} \d+, 00:00 UTC\)\./);
      expect(area.querySelector("time")!.getAttribute("dateTime")).toBe(new Date(settlesAfter(OPEN_DAY) * 1000).toISOString());
      expect(settleButton()).toBeNull();
      expect(s.settle).not.toHaveBeenCalled();
    });

    it("a guest: Connect to settle opens the wallet", async () => {
      const s = setup({ viewer: "guest" });
      const { wallet } = over(s);
      await userEvent.click(await screen.findByRole("button", { name: "Connect to settle" }, { timeout: 5000 }));
      await waitFor(() => expect(wallet.calls).toContain("connect"));
      expect(s.settle).not.toHaveBeenCalled();
    });

    it("someone who is not the player sees that it can be settled, and no button", async () => {
      const s = setup({ viewer: OTHER });
      over(s, "");
      const area = await screen.findByRole("region", { name: "Settle" }, { timeout: 5000 });
      expect(area).toHaveTextContent("can be settled now");
      expect(settleButton()).toBeNull();
    });

    it("the player settles: pending while it is sent, then settled from the receipt, with one reconcile", async () => {
      let release = () => {};
      const gate = new Promise<void>((r) => (release = r));
      const settle = vi.fn(async (): Promise<WriteResult & { noReward: number[] }> => {
        await gate;
        // The contract settles it: the chain holds the outcome from now on.
        s.economy.terms_.set(GAME_ID, fakeTerms({ stake: 3, day: READY_DAY, player: PLAYER, settled: true, reward: 5n * PAVED }));
        return { transactionHash: "0x1", noReward: [], events: [{ name: "Settled", fields: { gameId: GAME_ID, playerId: PLAYER, day: READY_DAY, score: played.game.score, threshold: 1_000_000, reward: 5n * PAVED }, fromAddress: "0x10" }] };
      });
      const s = setup({ settle, indexed: null });
      over(s);
      await userEvent.click(await screen.findByRole("button", { name: "Settle and claim" }, { timeout: 5000 }));
      const pending = await screen.findByRole("button", { name: "Settling…" });
      expect(pending).toHaveAttribute("aria-busy", "true");
      // A second tap while it is on its way reaches nothing.
      await userEvent.click(pending);
      expect(settle).toHaveBeenCalledTimes(1);
      expect(settle).toHaveBeenCalledWith([GAME_ID]);
      const readsBefore = s.economy.calls.filter((c) => c.startsWith("terms")).length;
      release();
      // The receipt's Settled is in the cache at once: the reward shows.
      const panel = await screen.findByRole("region", { name: "Reward" });
      await waitFor(() => expect(panel).toHaveAttribute("data-state", "rewarded"));
      expect(panel).toHaveTextContent("5.00");
      expect(await screen.findByText("Settled")).toBeInTheDocument();
      expect(settleButton()).toBeNull();
      // Then the terms are read once more, no more.
      await waitFor(() => expect(s.economy.calls.filter((c) => c.startsWith("terms")).length).toBe(readsBefore + 1));
      await new Promise((r) => setTimeout(r, 100));
      expect(s.economy.calls.filter((c) => c.startsWith("terms")).length).toBe(readsBefore + 1);
    });

    it("refused: the typed error is said, nothing is marked settled, the terms are read again and the button stays", async () => {
      const settle = vi.fn(async () => {
        throw new SettleTooEarlyError("0xabc");
      });
      const s = setup({ settle });
      over(s);
      await userEvent.click(await screen.findByRole("button", { name: "Settle and claim" }, { timeout: 5000 }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Settle refused");
      expect(alert).toHaveTextContent("This day cannot be settled yet");
      expect(screen.getByRole("button", { name: "Settle and claim" })).toBeEnabled();
      expect(screen.getByRole("region", { name: "Reward" })).toHaveAttribute("data-state", "awaiting");
      // Another try goes through.
      settle.mockImplementationOnce(async () => {
        throw new WriteError("Game 9 is not over yet");
      });
      await userEvent.click(screen.getByRole("button", { name: "Settle and claim" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Game 9 is not over yet"));
      expect(settle).toHaveBeenCalledTimes(2);
    });

    it("another settle landed first: the refusal's reconcile shows the game as already settled", async () => {
      const settle = vi.fn(async () => {
        s.economy.terms_.set(GAME_ID, fakeTerms({ stake: 3, day: READY_DAY, player: PLAYER, settled: true, reward: 0n }));
        throw new WriteError(`Game ${GAME_ID} is already settled`);
      });
      const s = setup({ settle });
      over(s);
      await userEvent.click(await screen.findByRole("button", { name: "Settle and claim" }, { timeout: 5000 }));
      expect(await screen.findByText("Already settled.")).toBeInTheDocument();
      expect(settleButton()).toBeNull();
    });

    it("someone settled it first (no Settled in the receipt): after the reconcile it reads Already settled, not Settled", async () => {
      const settle = vi.fn(async (): Promise<WriteResult & { noReward: number[] }> => {
        s.economy.terms_.set(GAME_ID, fakeTerms({ stake: 3, day: READY_DAY, player: PLAYER, settled: true, reward: 2n * PAVED }));
        return { transactionHash: "0x1", events: [], noReward: [] };
      });
      const s = setup({ settle, indexed: null });
      over(s);
      await userEvent.click(await screen.findByRole("button", { name: "Settle and claim" }, { timeout: 5000 }));
      expect(await screen.findByText("Already settled.")).toBeInTheDocument();
      expect(screen.queryByText("Settled")).toBeNull();
    });

    it("someone settled it first: Settle stays pending until the terms are read again, so a second tap sends nothing", async () => {
      let gate: Promise<void> | null = null;
      let release = () => {};
      const settle = vi.fn(async (): Promise<WriteResult & { noReward: number[] }> => {
        s.economy.terms_.set(GAME_ID, fakeTerms({ stake: 3, day: READY_DAY, player: PLAYER, settled: true, reward: 2n * PAVED }));
        // The reconciling read of the terms is slow.
        gate = new Promise<void>((r) => (release = r));
        return { transactionHash: "0x1", events: [], noReward: [] };
      });
      const s = setup({ settle, indexed: null });
      const terms = s.economy.terms.bind(s.economy);
      s.economy.terms = async (id) => {
        if (gate) await gate;
        return terms(id);
      };
      over(s);
      await userEvent.click(await screen.findByRole("button", { name: "Settle and claim" }, { timeout: 5000 }));
      await waitFor(() => expect(settle).toHaveBeenCalledTimes(1));
      // The receipt is in; the terms still read unsettled: no button to press again.
      await new Promise((r) => setTimeout(r, 200));
      expect(settleButton()).toBeNull();
      release();
      expect(await screen.findByText("Already settled.", undefined, { timeout: 3000 })).toBeInTheDocument();
      expect(settle).toHaveBeenCalledTimes(1);
    });

    it("no settlement source (no economy to send it through): the player has no button to press", async () => {
      const s = setup();
      s.sources.settlements = null;
      over(s);
      expect(await reward()).toHaveAttribute("data-state", "awaiting");
      expect(screen.queryByRole("region", { name: "Settle" })).toBeNull();
      expect(settleButton()).toBeNull();
    });
  });

  describe("routing", () => {
    it("a game still in play goes back to its board, replacing the entry", async () => {
      const s = setup({ game: { over: false } });
      const { router } = over(s);
      await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${GAME_ID}`), { timeout: 5000 });
      expect(router.state.historyAction).toBe("REPLACE");
    });

    it("a cached in-play game that is over now is not sent back to the board while it is read again", async () => {
      const s = setup();
      queryClient.setQueryData(queryKeys.chain.game(GAME_ID), { ...played.game, over: false });
      const { router } = over(s);
      expect(await reward()).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(`/game/${GAME_ID}/over`);
      expect(router.state.historyAction).not.toBe("REPLACE");
    });

    it("an unknown game is Game not found, with Back home", async () => {
      const s = setup({ noGame: true });
      const { router } = over(s);
      expect(await screen.findByText("Game not found", {}, { timeout: 5000 })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Back home" }));
      await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    });

    it.each(["abc", "1.5", "-3"])("a wrong id (%s) is Game not found without reading the chain", async (id) => {
      const s = setup();
      open(`/game/${id}/over`, s);
      expect(await screen.findByText("Game not found", {}, { timeout: 5000 })).toBeInTheDocument();
      expect(s.views.calls.filter((c) => c.startsWith("game "))).toEqual([]);
    });

    it("Play again opens the purchase and keeps the link's ?ref=", async () => {
      const s = setup({ terms: { settled: true } });
      const { router } = over(s, "?ref=0x77");
      await userEvent.click(await screen.findByRole("button", { name: "Play again" }, { timeout: 5000 }));
      await waitFor(() => expect(router.state.location.pathname).toBe("/play/challenge"));
      expect(router.state.location.search).toBe("?ref=0x77");
    });
  });

  describe("reads that fail", () => {
    it("a failed read shows the error with Retry, and Retry reads again; nothing polls", async () => {
      const s = setup();
      s.economy.fail = "economy node down";
      over(s);
      const alert = await screen.findByRole("alert", {}, { timeout: 8000 });
      expect(alert).toHaveTextContent("The game cannot be read");
      expect(alert).toHaveTextContent("economy node down");
      s.economy.fail = null;
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(await reward()).toBeInTheDocument();
      const reads = s.economy.calls.length;
      await new Promise((r) => setTimeout(r, 1_200));
      expect(s.economy.calls.length).toBe(reads);
    });

    it("the indexer not knowing the game yet is no error: the page shows from the chain", async () => {
      const s = setup({ indexed: null });
      over(s);
      expect(await reward()).toHaveAttribute("data-state", "awaiting");
      expect(screen.queryByText("The game cannot be read")).toBeNull();
    });

    it("a replay that does not match the chain shows no closings and says so, the rest of the page stays", async () => {
      const s = setup({ game: { score: played.game.score + 1 } });
      over(s);
      expect(await screen.findByText("The closings of this game could not be read.", {}, { timeout: 5000 })).toBeInTheDocument();
      expect(screen.getByTestId("score-value")).toBeInTheDocument();
    });
  });

  it("the real writer: the receipt's Settled decodes into the cache, and the writer sends settle([id]) once", async () => {
    const sent: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }> = [];
    const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12" };
    const f = fakeSources();
    holdGame(f.views, played);
    f.economy.terms_.set(GAME_ID, fakeTerms({ stake: 3, day: READY_DAY, player: PLAYER, score: played.game.score }));
    f.fixture.games = [];
    const account = {
      address: PLAYER,
      execute: async (calls: typeof sent) => {
        sent.push(...calls);
        return { transaction_hash: "0x1" };
      },
    };
    // Settled(game_id, player_id | day, score, threshold, reward): the keys and the data the contract emits.
    const receipt = {
      execution_status: "SUCCEEDED",
      events: [
        {
          from_address: ECON.economy,
          keys: [hash.getSelectorFromName("Settled"), `0x${GAME_ID.toString(16)}`, PLAYER],
          data: [`0x${READY_DAY.toString(16)}`, `0x${played.game.score.toString(16)}`, "0xf4240", `0x${(7n * PAVED).toString(16)}`],
        },
      ],
    };
    const rpc = {
      callContract: async () => [],
      getChainId: async () => FAKE_CHAIN_ID,
      getEvents: async () => ({ events: [] }),
      waitForTransaction: async () => {
        // The chain holds the outcome from now on.
        f.economy.terms_.set(GAME_ID, fakeTerms({ stake: 3, day: READY_DAY, player: PLAYER, settled: true, reward: 7n * PAVED }));
        return receipt;
      },
    } as unknown as PavedRpc;
    const base = resolveDeployment({ network: "devnet", file: FAKE_ROUTER_FILE, env: { rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: "0x3" } } });
    const client = new PavedClient({ ...base, chainId: FAKE_CHAIN_ID }, rpc, createCodecs(), f.views);
    const econ = createEconomyClient(resolveEconomyDeployment({ base: { ...base, chainId: FAKE_CHAIN_ID }, file: FAKE_ROUTER_FILE, env: { ...ECON, usdc: "0x13" } }), client, f.economy, f.pool)!;
    const writer = client.writer(account);
    const sources: DataSources = { ...f.sources, signer: writer as unknown as GameSigner, settlements: (signer) => settlementsFor(econ, signer) };
    render(<App router={createTestRouter(`/game/${GAME_ID}/over`)} sources={sources} connector={fakeWallet({ address: PLAYER }).load} />);
    await userEvent.click(await screen.findByRole("button", { name: "Settle and claim" }, { timeout: 5000 }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect([BigInt(sent[0]!.contractAddress), sent[0]!.entrypoint, sent[0]!.calldata.map(Number)]).toEqual([BigInt(ECON.economy), "settle", [1, GAME_ID]]);
    // The decoded event set the reward in the cache.
    const panel = await screen.findByRole("region", { name: "Reward" });
    await waitFor(() => expect(panel).toHaveAttribute("data-state", "rewarded"));
    expect(panel).toHaveTextContent("7.00");
  });
});

/** The indexer's `economy` object of a bought game. */
function economyRow(fields: Record<string, unknown>) {
  return {
    day: READY_DAY, stake: 3, price: "6000000", referrer: null, referral: "0", burned: "0", factor: 10_000, reference: "1000000000000000000",
    purchased_at: READY_DAY * DAY_SECONDS, recorded: true, expired: false, settled: false, threshold: null, reward: null, ...fields,
  };
}

describe("the over page's helpers", () => {
  it("mirror the chain's day arithmetic", () => {
    for (const day of [0, 20_000, 20_376]) expect(settlesAfter(day)).toBe(chainSettlesAfter(day));
  });

  it("thresholdOf is curve::threshold: mean x (10,000 + sigma) / 10,000, cut", () => {
    expect(thresholdOf(1_000_000, 0)).toBe(1_000_000);
    expect(thresholdOf(1_000_000, 500)).toBe(1_050_000);
    expect(thresholdOf(1_000_000, -2_500)).toBe(750_000);
    expect(thresholdOf(3, 3_333)).toBe(3);
  });

  it("rewardOf: the indexer's threshold once settled, the day's otherwise, null while the day is open", () => {
    const open = { prior: 0, sum: 0n, weight: 0, mean: 0, closed: false };
    expect(rewardOf(fakeTerms({ stake: 1 }), open, undefined)).toEqual({ kind: "pending", threshold: null });
    expect(rewardOf(fakeTerms({ stake: 1, sigmaBps: -1_000 }), { ...open, mean: 2_000_000, closed: true }, undefined)).toEqual({ kind: "pending", threshold: 1_800 });
    expect(rewardOf(fakeTerms({ stake: 1, settled: true, reward: 1n }), null, { economy: { threshold: 77_000 } } as never)).toEqual({ kind: "rewarded", amount: 1n, threshold: 77 });
    expect(rewardOf(null, null, undefined)).toEqual({ kind: "none" });
    expect(rewardOf(null, null, { free: true } as never)).toEqual({ kind: "free" });
  });

  it("replayClosings lists what the moves closed, and refuses a game the engine does not reproduce", () => {
    expect(replayClosings(played.seed, played.tiles, played.game)).toEqual(played.closings);
    expect(() => replayClosings(played.seed, played.tiles, { ...played.game, score: played.game.score + 1 })).toThrow(/score/);
    expect(() => replayClosings(played.seed + 1n, played.tiles, played.game)).toThrow(/Replay/);
    expect(() => replayClosings(played.seed, [], played.game)).toThrow(/no starter/);
  });
});
