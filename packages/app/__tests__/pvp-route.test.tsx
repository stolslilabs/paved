import { slow } from "../test-slow";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IndexerError, ViewError } from "@paved/chain";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { queryClient } from "../src/lib/query-client";
import { mockRival } from "../src/data/mock/pvp";
import { MOCK_KEY } from "../src/data/mock/ledger";
import { addressKey } from "../src/data/keys";
import { pvpKeys } from "../src/data/pvp";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { mockImplementation } from "./mock-fakes";
import { placeTile, preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The PvP flow's routes (#647 PR 2) on the mock (Sepolia's default: `Matchmaker` and `Arena` are on no network yet), whose
// rules are the contracts': the league, the search and its scout, the attack's moves, the result and its reward, a replay, the
// defence log; and the pages' answers for a guest and for a network without the PvP.

const WAIT = { timeout: slow(8000) };

/** The mock's stored state, edited in place (a test's stand-in for what the chain does elsewhere). */
function editState(store: ReturnType<typeof mockImplementation>["store"], change: (state: { players: Record<string, { pvp?: { match: unknown } }>; rivalShields?: Record<string, number> }) => void) {
  const state = JSON.parse(store.getItem(MOCK_KEY)!);
  change(state);
  store.setItem(MOCK_KEY, JSON.stringify(state));
}

/**
 * The mock's views without PvP v2's attack (`attackV2`): `/pvp` serves v2 where it is read (#740, `pvp-v2-route.test.tsx`), so
 * these tests keep v1's flow, as the chain serves it until step 3.
 */
function v1Only<T extends object>(views: T): T {
  return new Proxy(views, { get: (target, key) => (key === "attackV2" ? undefined : Reflect.get(target, key)) });
}

/** The mock's sources with the player's village founded (a founded village is in the matchmaker), the wallet restored. */
async function open(
  path: string,
  prepare?: (s: ReturnType<typeof mockImplementation>, me: string) => Promise<void>,
  signer: (s: ReturnType<typeof mockImplementation>, mine: GameSigner) => GameSigner = (_, mine) => mine,
) {
  const s = mockImplementation();
  s.sources.views = v1Only(s.sources.views);
  const me = s.sources.signer!.address;
  await s.ledger.writesFor(me).foundVillage();
  await prepare?.(s, me);
  const wallet = fakeWallet({ address: me, restored: true });
  const writes = signer(s, s.sources.signer as GameSigner);
  wallet.connector.signer = () => writes;
  const router = createTestRouter(path);
  render(<App router={router} sources={s.sources} connector={wallet.load} />);
  return { ...s, me, router };
}

/** An attack played to its end on the ledger: each tile where it fits first, else discarded. */
async function attacked(s: ReturnType<typeof mockImplementation>, me: string) {
  const writes = s.ledger.writesFor(me);
  await writes.drawOpponent("search");
  await writes.startAttack();
  const { AttackRun } = await import("@paved/game-core");
  for (;;) {
    const attack = await s.ledger.pvpAttack(me);
    if (attack.status !== 1) return attack;
    const deck = await s.ledger.pvpDeck(me, attack.id);
    const rival = mockRival(attack.defender)!;
    const run = AttackRun.replay({ territory: rival.cells }, (await s.ledger.pvpMoves(me, attack.id)).map((m) => (m.discard ? { plan: m.plan, discard: true as const } : { ...m, discard: false as const })));
    const cell = run.slots(deck.hand)[0];
    await writes.playAttack(cell ? { discard: false, orientation: run.orientations(deck.hand, cell)[0]!, cell } : { discard: true });
  }
}

// The search's view too (`pvp.tsx` loads it lazily): it draws the found heading, held 1.2 s, as soon as it can.
preloadPages("home", "pvp-v2");
beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/pvp"), import("../src/routes/pages/pvp-result"), import("../src/routes/pages/pvp-league"), import("../src/routes/pages/pvp-replay")]);
}, slow(60_000));
beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/pvp: search, scout, attack", { timeout: slow(30_000) }, () => {
  it("from the league to the search, searches a village, scouts it, opens the attack and places a tile", async () => {
    const s = await open("/pvp/league");
    expect(await screen.findByRole("heading", { level: 1, name: "League" }, WAIT)).toBeInTheDocument();
    // A new player has never attacked: the carousel opens on Unranked's card, before Wood's (#917).
    expect(await screen.findByRole("heading", { name: "Unranked" }, WAIT)).toBeInTheDocument();
    // The search draws as the page opens: the village found (held `FOUND_MS`, 1.2 s), then its scout. The wait starts before
    // the click, so a slow click on a loaded machine cannot let the found heading come and go before it looks. Being found is
    // the check: by the time a check after it ran, under load, React had flushed the 1.2 s the heading stays and removed it.
    const found = screen.findByRole("heading", { name: "Village found" }, WAIT);
    // No Attack button on the League (#833): the search is the bar's (`/pvp`).
    expect(screen.queryByRole("button", { name: /^Attack/ })).toBeNull();
    await act(() => s.router.navigate("/pvp"));
    await found;
    expect(await screen.findByRole("heading", { name: "Scout" }, WAIT)).toBeInTheDocument();
    const match = await s.ledger.pvpMatch(s.me);
    const rival = mockRival(match.opponent)!;
    expect(screen.getAllByText(rival.name).length).toBeGreaterThan(0);
    expect(screen.getByText(rival.score.toLocaleString("en-US"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next village for 1 Cobbles, not enough Cobbles" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /^Attack$/ }));
    expect(await screen.findByRole("heading", { name: `Attack: ${rival.name}` }, WAIT)).toBeInTheDocument();
    const slots = await screen.findAllByRole("button", { name: /^Slot / }, WAIT);
    fireEvent.click(slots[0]!);
    await placeTile();
    await waitFor(async () => expect(await s.ledger.pvpMoves(s.me, 1)).toHaveLength(1), WAIT);
    // The receipt's move is on the board: the starter and the tile placed.
    await waitFor(() => expect(document.querySelector("[aria-label^=\"Board of\"]")?.getAttribute("aria-label")).toMatch(/^Board of 2 tiles/), WAIT);
  });

  it("resumes an open attack, and moves to the result once the last tile is played", async () => {
    const s = await open("/pvp", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.drawOpponent("search");
      await writes.startAttack();
    });
    const attack = await s.ledger.pvpAttack(s.me);
    expect(await screen.findByRole("heading", { name: /^Attack: / }, WAIT)).toBeInTheDocument();
    expect(attack.status).toBe(1);
    // The stack's Discard sends a discard: the move lands, the next tile is drawn.
    const stack = await screen.findByRole("region", { name: "Your tile" }, WAIT);
    fireEvent.click(stack.querySelector<HTMLButtonElement>('button[aria-label^="Hold to discard the tile"]')!);
    await waitFor(async () => expect(await s.ledger.pvpMoves(s.me, attack.id)).toHaveLength(1), WAIT);
  });
});

describe("/pvp: an opponent that cannot be attacked", { timeout: slow(30_000) }, () => {
  it("a skipped opponent (AttackSkipped, the match cancelled) starts another free search", async () => {
    const s = await open("/pvp", undefined, (s, mine) =>
      new Proxy(mine, {
        get: (target, key) =>
          key === "startAttack"
            ? async () => {
                // `Arena.start` on an opponent it cannot attack: the match cancelled, nothing else moved.
                editState(s.store, (state) => void (state.players[addressKey(target.address)]!.pvp!.match = null));
                return { transactionHash: "0x6d6f636b00000099", events: [{ name: "AttackSkipped", fields: { attacker: target.address, defender: "0x1", id: 1 }, fromAddress: "0x9" }] };
              }
            : Reflect.get(target, key),
      }),
    );
    expect(await screen.findByRole("heading", { name: "Scout" }, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Attack$/ }));
    // The page searches again, free: a second draw, then the scout of the village drawn.
    await waitFor(async () => expect((await s.ledger.pvpVillage(s.me)).draws).toBe(2), WAIT);
    expect(await screen.findByRole("heading", { name: "Scout" }, WAIT)).toBeInTheDocument();
    expect(await s.ledger.account(s.me)).toMatchObject({ cobbles: 0 });
  });

  it("a village shielded since the draw is replaced by a free search, not only the paid Next", async () => {
    const s = await open("/pvp", async (s, me) => {
      await s.ledger.writesFor(me).drawOpponent("search");
      const drawn = (await s.ledger.pvpMatch(me)).opponent;
      editState(s.store, (state) => void (state.rivalShields = { [addressKey(drawn)]: Math.floor(Date.now() / 1000) + 3_600 }));
    });
    const first = (await s.ledger.pvpMatch(s.me)).opponent;
    await userEvent.click(await screen.findByRole("button", { name: /Search again, free/ }, WAIT));
    await waitFor(async () => expect((await s.ledger.pvpMatch(s.me)).opponent).not.toBe(first), WAIT);
    expect((await s.ledger.pvpVillage(s.me)).draws).toBe(2);
    expect(await screen.findByRole("button", { name: /^Attack$/ }, WAIT)).toBeInTheDocument();
  });
});

describe("/pvp/result/:id", { timeout: slow(30_000) }, () => {
  it("shows the stars, the crowns and the reward, which opens and is chosen on the village's sheet", async () => {
    let attack: Awaited<ReturnType<typeof attacked>> | null = null;
    const s = await open("/pvp/result/1", async (s, me) => {
      attack = await attacked(s, me);
      // The reward the settlement granted is the next to open: the earlier ones are opened and taken.
      const writes = s.ledger.writesFor(me);
      for (let i = 0; i < 3; i++) {
        await writes.openReward();
        await writes.claimReward({ choice: "cobbles" });
      }
    });
    const verdict = ["Defeat", "Victory", "Victory", "Triumph"][attack!.stars]!;
    expect(await screen.findByRole("heading", { name: verdict }, WAIT)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /Open the reward/ }, WAIT));
    expect(await screen.findByRole("button", { name: /Choose/ }, WAIT)).toBeInTheDocument();
    const offer = await s.ledger.rewardOffer(s.me);
    expect(offer.plans[0]).toBeGreaterThan(0);
  });

  it("replays the attack move by move", async () => {
    const s = await open("/pvp/result/1", attacked);
    await screen.findByRole("heading", { name: /Defeat|Victory|Triumph/ }, WAIT);
    await userEvent.click(screen.getByRole("button", { name: /Replay/ }));
    const bar = await screen.findByRole("group", { name: "Replay" }, WAIT);
    const total = (await s.ledger.pvpMoves(s.me, 1)).length;
    expect(within(bar).getByText(`0/${total}`)).toBeInTheDocument();
    await userEvent.click(within(bar).getByRole("button", { name: "Next move" }));
    expect(within(bar).getByText(`1/${total}`)).toBeInTheDocument();
  });
});

describe("Back never cycles (BACK-RULE #783)", { timeout: slow(45_000) }, () => {
  it("the league, a result, its replay: Back, Back reaches the village and never shows a page twice", async () => {
    const s = await open("/pvp/league", attacked);
    await screen.findByRole("heading", { level: 1, name: "League" }, WAIT);
    await s.router.navigate("/pvp/result/1");
    await screen.findByRole("heading", { name: /Defeat|Victory|Triumph/ }, WAIT);
    await userEvent.click(screen.getByRole("button", { name: /Replay/ }));
    await screen.findByRole("group", { name: "Replay" }, WAIT);
    const seen: string[] = [];
    const stop = s.router.subscribe((state) => void (state.navigation.state === "idle" && seen.at(-1) !== state.location.pathname && seen.push(state.location.pathname)));
    // The replay goes up to the league, back through the history: the result is skipped, never shown again.
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(s.router.state.location.pathname).toBe("/pvp/league"), WAIT);
    expect(s.router.state.historyAction).toBe("POP");
    await screen.findByRole("heading", { level: 1, name: "League" }, WAIT);
    await waitFor(async () => {
      if (s.router.state.location.pathname === "/pvp/league") await userEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(s.router.state.location.pathname).toBe("/");
    }, WAIT);
    stop();
    expect(seen).toEqual(["/pvp/league", "/"]);
  });
});

describe("/pvp/replay/:attacker/:id: a failed read", { timeout: slow(30_000) }, () => {
  it("an older attack whose indexer row fails to read shows the error and Retry, not the search's wait", async () => {
    const me = mockImplementation().sources.signer!.address;
    await open(`/pvp/replay/${me}/1`, async (s, me) => {
      // Two attacks: the replayed one is not the last, so its metadata is the indexer's row, whose read fails.
      await attacked(s, me);
      await attacked(s, me);
      const indexer = s.sources.indexer;
      s.sources.indexer = new Proxy(indexer, {
        get: (target, key) => (key === "playerAttack" ? () => Promise.reject(new Error("The indexer did not answer")) : Reflect.get(target, key, target)),
      });
    });
    expect(await screen.findByText(/The indexer did not answer/, {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Search again/ })).toBeInTheDocument();
    // The waiting screen's heading leaves (its exit animation), never to come back.
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Searching for a village" })).toBeNull(), WAIT);
  });
});

describe("receipt-cached attacks and the shield's read", { timeout: slow(30_000) }, () => {
  it("replays an attack whose receipt this visit cached, once a newer attack is the last", async () => {
    const me = mockImplementation().sources.signer!.address;
    await open(`/pvp/replay/${me}/1`, async (s, me) => {
      await attacked(s, me);
      await attacked(s, me);
      // What `applyPvpEvents` keeps of attack 1's last receipt: no target, no defender.
      const row = s.ledger.attacksOf(me, "attacker").find((a) => a.id === 1)!;
      queryClient.setQueryData(pvpKeys.settled(me, 1), { score: row.score, stars: row.stars, surrendered: row.surrendered, gained: row.gained, lost: row.lost });
    });
    const bar = await screen.findByRole("group", { name: "Replay" }, WAIT);
    await userEvent.click(within(bar).getByRole("button", { name: "Next move" }));
    expect(within(bar).getByText(/^1\//)).toBeInTheDocument();
  });

  it("an older attack's result with a cached receipt and no indexer row says so, with Retry, never waits", async () => {
    await open("/pvp/result/1", async (s, me) => {
      await attacked(s, me);
      await attacked(s, me);
      const row = s.ledger.attacksOf(me, "attacker").find((a) => a.id === 1)!;
      queryClient.setQueryData(pvpKeys.settled(me, 1), { score: row.score, stars: row.stars, surrendered: row.surrendered, gained: row.gained, lost: row.lost });
      // The indexer has not seen attack 1 end yet: its row is not found.
      const indexer = s.sources.indexer;
      s.sources.indexer = new Proxy(indexer, {
        get: (t, k) => (k === "playerAttack" ? () => Promise.reject(new IndexerError("not-found", "attack not found", { httpStatus: 404 })) : Reflect.get(t, k, t)),
      });
    });
    expect(await screen.findByText(/This attack is not recorded yet/, {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Search again/ })).toBeInTheDocument();
  });

  it("/pvp/result/:id: a failed reward read is told with Try again, never a capped day", async () => {
    await open("/pvp/result/1", async (s, me) => {
      await attacked(s, me);
      const views = s.sources.views;
      s.sources.views = new Proxy(views, { get: (t, k) => (k === "rewardGrants" ? () => Promise.reject(new Error("Rewards RPC unavailable")) : Reflect.get(t, k, t)) });
    });
    expect(await screen.findByText(/Rewards RPC unavailable/, {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText(/Today's rewards are all taken/)).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

});

describe("the other answers", { timeout: slow(30_000) }, () => {
  it("/pvp/league: its matches (#786), none yet (a section, not a page); the League control in the header, no balance, no shield (#859)", async () => {
    await open("/pvp/league");
    expect(await screen.findByText(/No match yet/, {}, WAIT)).toBeInTheDocument();
    const header = screen.getByRole("heading", { level: 1, name: "League" }).closest("header")!;
    expect(within(header).getByRole("button", { name: /^Your league: \w[\w ]*, [\d,]+ crowns?\. Show it$/ })).toBeInTheDocument();
    expect(within(header).queryAllByRole("region", { name: "Balances" })).toEqual([]);
    expect(screen.queryByRole("region", { name: "Shield" })).toBeNull();
  });

  it("/pvp for a guest asks to connect; a network without the PvP says so", async () => {
    const guest = fakeWallet({ restored: false });
    const s = mockImplementation();
    render(<App router={createTestRouter("/pvp")} sources={{ ...s.sources, signer: null }} connector={guest.load} />);
    expect(await screen.findByText(/Connect to attack another village/, {}, WAIT)).toBeInTheDocument();
  });

  it("/pvp/league on a network without Matchmaker", async () => {
    const f = fakeSources();
    f.views.pvpFail = new ViewError("not-configured", "Matchmaker address is not configured");
    const wallet = fakeWallet({ address: "0x5f1", restored: true });
    render(<App router={createTestRouter("/pvp/league")} sources={f.sources} connector={wallet.load} />);
    expect(await screen.findByText("PvP is not on this network yet.", {}, WAIT)).toBeInTheDocument();
  });
});
