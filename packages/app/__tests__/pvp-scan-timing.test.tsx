import { slow } from "../test-slow";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { addressKey } from "../src/data/keys";
import { queryClient } from "../src/lib/query-client";
import { MOCK_KEY } from "../src/data/mock/ledger";
import { mockRivalV2 } from "../src/data/mock/v2";
import { V2RefusedError } from "../src/data/free-village";
import { createTestRouter } from "../src/routes/router";
import { NEXT_SCAN_MS, SEARCH_SCAN_MS } from "../src/routes/pvp-v2";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { discardTile, preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// RANKED-SCAN-TIMING (#1067, the owner's decisions of 2026-11-07): the search's scan lasts 3 s at least, longer while the search
// has not answered, then the rival found and the scout; Next and Search again show it 1 s, then the new rival's scout with no
// found screen; the scan means a search, nothing else: the end of an attack and a resumed attack never show it.

const WAIT = { timeout: slow(8000) };
/** The real clock's wait, kept before the timers are faked: the polls below wait on it, never on the fake clock. */
const realTimeout = globalThis.setTimeout;
const realWait = (ms: number) => new Promise<void>((done) => realTimeout(done, ms));

type Mock = ReturnType<typeof mockImplementation>;

async function open(path: string, prepare?: (s: Mock, me: string) => Promise<void>) {
  const s = mockImplementation();
  const me = s.sources.signer!.address;
  await prepare?.(s, me);
  const wallet = fakeWallet({ address: me, restored: true });
  wallet.connector.signer = () => s.sources.signer as GameSigner;
  render(<App router={createTestRouter(path)} sources={s.sources} connector={wallet.load} />);
  return { ...s, me };
}

/** The mock's stored state, edited in place (a test's stand-in for what happens elsewhere). */
function editState(store: Mock["store"], change: (state: { players: Record<string, { cobbles: number }>; rivalShields?: Record<string, number> }) => void) {
  const state = JSON.parse(store.getItem(MOCK_KEY)!);
  change(state);
  store.setItem(MOCK_KEY, JSON.stringify(state));
}

/** The search scene's state, or null when it is not up. */
const scan = () => document.querySelector('section[aria-label="Search"]')?.getAttribute("data-state") ?? null;
const scouting = () => screen.queryByRole("heading", { name: "Scout" }) !== null;

/** Runs the timers due now (the mock's zero latency) and lets the page render, the fake clock held, until `check` holds. */
async function until(check: () => boolean | Promise<boolean>, what: string) {
  const end = performance.now() + slow(8000);
  while (performance.now() < end) {
    await act(() => vi.advanceTimersByTimeAsync(0));
    if (await check()) return;
    await realWait(10);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/** Moves the fake clock on by `ms`, then lets the page settle with the clock held. */
async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
  for (let i = 0; i < 5; i++) {
    await act(() => vi.advanceTimersByTimeAsync(0));
    await realWait(5);
  }
}

/** The elements matching `selector` among the nodes a mutation added (one that came and went in a batch included). */
const added = (records: MutationRecord[], selector: string): Element[] =>
  records.flatMap((r) => [...r.addedNodes].flatMap((n) => (n instanceof Element ? [...(n.matches(selector) ? [n] : []), ...n.querySelectorAll(selector)] : [])));

/** Every state the search scene took, and whether the neutral loading was put up, from now on. */
function watchScenes() {
  const states = new Set<string>();
  const seen = { loading: false };
  const look = (records: MutationRecord[] = []) => {
    const state = scan();
    if (state) states.add(state);
    for (const s of added(records, 'section[aria-label="Search"]')) states.add(s.getAttribute("data-state") ?? "");
    for (const r of records) if (r.type === "attributes" && r.target instanceof Element && r.target.matches('section[aria-label="Search"]')) states.add(r.target.getAttribute("data-state") ?? "");
    if (document.querySelector("[data-pvp-loading]") || added(records, "[data-pvp-loading]").length > 0) seen.loading = true;
  };
  const observer = new MutationObserver(look);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] });
  look();
  return { states, seen, stop: () => observer.disconnect() };
}

/** The read of an attack by its id (the end's) answers 300 ms late, as over a network. */
function slowAttackRead(s: Mock) {
  const views = s.sources.views as typeof s.sources.views & { attackV2Of: (attacker: string, id: number) => Promise<unknown> };
  const read = views.attackV2Of;
  const slowRead = (attacker: string, id: number) => realWait(300).then(() => read(attacker, id));
  s.sources.views = new Proxy(views, { get: (t, key) => (key === "attackV2Of" ? slowRead : Reflect.get(t, key)) });
}

const withCobbles =(s: Mock, me: string) => editState(s.store, (state) => void (state.players[addressKey(me)]!.cobbles = 5));

preloadPages("home");
beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/pvp"), import("../src/routes/pvp-v2"), import("../src/routes/pages/pvp-league"), import("../src/routes/pages/pvp-result"), import("../src/routes/pvp-v2-end"), import("../src/components/containers/final-board"), import("../src/components/containers/deck-sheet")]);
}, slow(60_000));
beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.useRealTimers();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

/** Timeouts and intervals faked; the clock of the dates and `performance` real (the mock's shields, the polls). */
const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });

describe("Ranked's scan timings (#1067), fake timers", { timeout: slow(40_000) }, () => {
  it("the search shows the scan for 3 s though it answered at once, then the rival found, then the scout", async () => {
    expect(SEARCH_SCAN_MS).toBe(3_000);
    fakeTimers();
    const s = await open("/pvp", async (s, me) => void (await s.ledger.writesFor(me).foundFreeVillage()));
    await until(() => scan() === "searching", "the scan");
    await until(async () => (await s.ledger.attackV2(s.me)).match !== null, "the search's answer");
    await advance(2_900);
    expect(scan()).toBe("searching");
    expect(scouting()).toBe(false);
    await advance(100);
    await until(() => scan() === "found", "the rival found");
    await advance(1_200);
    await until(scouting, "the scout");
  });

  it("the search's scan lasts as long as the search when its answer is late", async () => {
    fakeTimers();
    let answer: () => void = () => undefined;
    const late = new Promise<void>((done) => (answer = done));
    const s = await open("/pvp", async (s, me) => {
      await s.ledger.writesFor(me).foundFreeVillage();
      // The ledger's draw, held until the test lets it answer.
      const draw = s.ledger.drawOpponentV2.bind(s.ledger);
      s.ledger.drawOpponentV2 = (account, kind) => late.then(() => draw(account, kind));
    });
    await until(() => scan() === "searching", "the scan");
    await advance(5_000);
    expect(scan()).toBe("searching");
    expect((await s.ledger.attackV2(s.me)).match).toBeNull();
    answer();
    await until(() => scan() === "found", "the rival found once the search answered");
  });

  it("Next shows the scan for 1 s, then the new rival's scout, with no found screen", async () => {
    expect(NEXT_SCAN_MS).toBe(1_000);
    const s = await open("/pvp", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      withCobbles(s, me);
    });
    expect(await screen.findByRole("heading", { name: "Scout" }, WAIT)).toBeInTheDocument();
    fakeTimers();
    const seen = watchScenes();
    for (let i = 0; i < 2; i++) {
      const first = (await s.ledger.attackV2(s.me)).match!.opponent;
      fireEvent.click(screen.getByRole("button", { name: /^Next village for / }));
      await until(() => scan() === "searching", "the scan");
      await until(async () => (await s.ledger.attackV2(s.me)).match?.opponent !== first, "Next's answer");
      await advance(900);
      expect(scan()).toBe("searching");
      await advance(100);
      await until(scouting, "the new rival's scout");
      // The rival the draw answered, never the last one's scout again.
      const drawn = (await s.ledger.attackV2(s.me)).match!.opponent;
      expect(screen.getAllByText(mockRivalV2(drawn)!.name).length).toBeGreaterThan(0);
    }
    seen.stop();
    expect([...seen.states]).toEqual(["searching"]);
    // The new rival's village read under the scan: no loading screen after it.
    expect(seen.seen.loading).toBe(false);
  });

  it("Search again, for a rival shielded since the draw, shows the scan for 1 s, then the new rival's scout", async () => {
    const s = await open("/pvp", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      const drawn = (await s.ledger.attackV2(me)).match!.opponent;
      editState(s.store, (state) => void (state.rivalShields = { [addressKey(drawn)]: Math.floor(Date.now() / 1000) + 3_600 }));
    });
    expect(await screen.findByRole("heading", { name: "Scout" }, WAIT)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("region", { name: "Attack" })).getByRole("button", { name: /^Attack$/ }));
    const again = await screen.findByRole("button", { name: /Search again, free/ }, WAIT);
    fakeTimers();
    const seen = watchScenes();
    const first = (await s.ledger.attackV2(s.me)).match!.opponent;
    fireEvent.click(again);
    await until(() => scan() === "searching", "the scan");
    await until(async () => (await s.ledger.attackV2(s.me)).match?.opponent !== first, "the search's answer");
    await advance(900);
    expect(scan()).toBe("searching");
    await advance(100);
    await until(scouting, "the new rival's scout");
    seen.stop();
    expect([...seen.states]).toEqual(["searching"]);
  });

  it("a refused Next goes back to the scout with its message at once (Cobbles short on the chain's side)", async () => {
    await open("/pvp", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      withCobbles(s, me);
      // The ledger refuses Next though the page saw Cobbles enough.
      s.ledger.drawOpponentV2 = () => Promise.reject(new V2RefusedError("not-enough-cobbles"));
    });
    expect(await screen.findByRole("heading", { name: "Scout" }, WAIT)).toBeInTheDocument();
    fakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /^Next village for / }));
    // No wait on the clock: the refusal is said on the scout.
    await until(() => screen.queryByText("Not enough Cobbles for another village.") !== null, "the refusal on the scout");
    expect(scouting()).toBe(true);
  });
});

describe("The scan means a search, nothing else (#1067)", { timeout: slow(40_000) }, () => {
  it("never shows on a resumed attack, nor at its end: the board stays until the end screen comes up", async () => {
    const resume = watchScenes();
    await open("/pvp", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      await writes.startAttackV2();
      const { attack } = await s.ledger.attackV2(me);
      for (let i = 0; i < attack!.deck - 1; i++) await writes.playAttackV2({ discard: true });
      // The end's read takes its time, as on a network: the page must not show a loading screen meanwhile.
      slowAttackRead(s);
    });
    expect(await screen.findByRole("heading", { name: /^Attack: / }, WAIT)).toBeInTheDocument();
    resume.stop();
    // The resumed attack waited on the neutral loading at most, never on the scan.
    expect(resume.states.size).toBe(0);
    // From the last tile to the end: the attack's board, then the end, never a loading screen between.
    const end = watchScenes();
    let gap = false;
    const board = new MutationObserver(() => {
      const attack = screen.queryByRole("heading", { name: /^Attack: / }) !== null;
      const over = screen.queryByRole("heading", { level: 1, name: "Attack over" }) !== null;
      if (!attack && !over) gap = true;
    });
    board.observe(document.body, { subtree: true, childList: true });
    await discardTile();
    expect(await screen.findByRole("heading", { level: 1, name: "Attack over" }, WAIT)).toBeInTheDocument();
    board.disconnect();
    end.stop();
    expect(end.states.size).toBe(0);
    expect(end.seen.loading).toBe(false);
    expect(gap).toBe(false);
  });

  it("a link straight to a result waits on the rival's void with a spinner, never the scan", async () => {
    const seen = watchScenes();
    await open("/pvp/result/1", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      await writes.startAttackV2();
      await writes.surrenderAttackV2();
      slowAttackRead(s);
    });
    // The read on its way: the neutral loading, a spinner over the rival's void.
    await waitFor(() => expect(within(document.querySelector<HTMLElement>("[data-pvp-loading]")!).getByRole("status", { name: "Loading" })).toBeInTheDocument(), WAIT);
    expect(await screen.findByRole("heading", { name: "Surrendered" }, WAIT)).toBeInTheDocument();
    seen.stop();
    expect(seen.states.size).toBe(0);
  });
});
