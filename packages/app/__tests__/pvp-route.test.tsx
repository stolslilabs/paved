import { slow } from "../test-slow";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ViewError } from "@paved/chain";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { queryClient } from "../src/lib/query-client";
import { mockRival } from "../src/data/mock/pvp";
import { MOCK_KEY } from "../src/data/mock/ledger";
import { addressKey } from "../src/data/keys";
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

/** The mock's sources with the player's village founded (a founded village is in the matchmaker), the wallet restored. */
async function open(
  path: string,
  prepare?: (s: ReturnType<typeof mockImplementation>, me: string) => Promise<void>,
  signer: (s: ReturnType<typeof mockImplementation>, mine: GameSigner) => GameSigner = (_, mine) => mine,
) {
  const s = mockImplementation();
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

preloadPages("home");
beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/pvp"), import("../src/routes/pages/pvp-result"), import("../src/routes/pages/pvp-league"), import("../src/routes/pages/pvp-defence"), import("../src/routes/pages/pvp-replay")]);
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
  it("from the league, searches a village, scouts it, opens the attack and places a tile", async () => {
    const s = await open("/pvp/league");
    expect(await screen.findByRole("heading", { level: 1, name: "League" }, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unranked" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Attack/ }));
    // The search draws as the page opens: the village found, then its scout.
    expect(await screen.findByRole("heading", { name: "Village found" }, WAIT)).toBeInTheDocument();
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

describe("the other answers", { timeout: slow(30_000) }, () => {
  it("/pvp/defence: no attack on the village yet, no shield", async () => {
    await open("/pvp/defence");
    expect(await screen.findByText("No attack on your village yet.", {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Shield" })).toHaveAttribute("data-shield", "off");
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
