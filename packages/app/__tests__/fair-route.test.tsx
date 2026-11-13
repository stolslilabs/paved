import { slow } from "../test-slow";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAIR_OFFERS, FairDraft, fairEndsAt, fairIsMythic, fairRandomOf, fairWeekOf, fairWeekStart } from "@paved/game-core";
import { App } from "../src/App";
import type { FairTryRecord } from "../src/data/fair-source";
import { queryClient } from "../src/lib/query-client";
import { MockLedger } from "../src/data/mock/ledger";
import { mockFair } from "../src/data/mock/overlay";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// The Fair (the weekly individual event) on its routes, on a mock ledger's Fair: Play's card, the week's view and its Start, the draft
// as a view (a pick, the last pick opening the game, Leave), the ranking, a try's end and Monday's claim. The scenes' own states are
// `fair.test.tsx`'s.

const WEEK = fairWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
/** Tuesday noon. `Date` alone is faked: the timers stay real for the waits. */
const TUESDAY = new Date((fairWeekStart(WEEK) + 86_400 + 43_200) * 1000);

const newLedger = () => new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });

/** The app at `path` on the fakes, the Fair the ledger's; the wallet restores the mocks' player. */
function open(path: string, ledger = newLedger()) {
  const fair = mockFair(ledger);
  const f = fakeSources({ fair });
  const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
  const router = createTestRouter(path);
  render(<App router={router} sources={f.sources} connector={wallet.load} />);
  return { router, fair, ledger };
}

const draftOf = (record: FairTryRecord) => FairDraft.replay(record.season, fairRandomOf(BigInt(record.seed)), record.picks);

/** A try of the player drafted on the ledger up to offer `until` (the whole draft by default), no mythic taken. */
async function drafted(ledger: MockLedger, until = Infinity): Promise<FairTryRecord> {
  const fair = mockFair(ledger);
  let record = await fair.start(PLAYER_ID);
  for (let draft = draftOf(record); !draft.over && draft.offer!.number < until; draft = draftOf(record)) {
    record = await fair.pick(PLAYER_ID, record.id, draft.offer!.number, Math.max(0, draft.offer!.cards.findIndex((card) => !fairIsMythic(card))));
  }
  return record;
}

vi.mock("../src/routes/pages/board", async () => (await import("./route-helpers")).boardStandInModule);
preloadPages("home", "play", "over");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: TUESDAY });
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(async () => {
  vi.useRealTimers();
  // The app is unmounted and its reads are stopped before the cache is cleared (as `joust-route.test.tsx`).
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/play: the Fair's card in Limited", () => {
  it("shows the card where the network has a Fair, and opens its view", async () => {
    const { router } = open("/play");
    const card = await screen.findByRole("button", { name: "Fair" }, { timeout: slow(5000) });
    await waitFor(() => expect(card).toHaveTextContent("3 tries left today"), { timeout: slow(5000) });
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/fair"));
    expect(await screen.findByRole("button", { name: "Start try 1" }, { timeout: slow(8000) })).toBeInTheDocument();
  });

  it("opens the draft still open from the card", async () => {
    const ledger = newLedger();
    await drafted(ledger, 3);
    const { router } = open("/play", ledger);
    await userEvent.click(await screen.findByRole("button", { name: "Fair: resume your draft, pick 3" }, { timeout: slow(8000) }));
    await waitFor(() => expect(router.state.location.search).toBe("?view=draft"));
    expect(await screen.findByRole("list", { name: "Offer 3" }, { timeout: slow(8000) })).toBeInTheDocument();
  });
});

describe("/play/fair: the week and the draft", () => {
  it("starts a try: its draft opens as a view, a pick shows the next offer and reaches the source", async () => {
    const { router, fair } = open("/play/fair");
    await userEvent.click(await screen.findByRole("button", { name: "Start try 1" }, { timeout: slow(8000) }));
    await waitFor(() => expect(router.state.location.search).toBe("?view=draft"), { timeout: slow(5000) });
    const offer = await screen.findByRole("list", { name: "Offer 1" }, { timeout: slow(8000) });
    expect(screen.getByRole("heading", { name: "Draft" })).toBeInTheDocument();
    expect(screen.getByText(/No tile yet/)).toBeInTheDocument();
    const id = (await fair.state(PLAYER_ID)).me!.open!.id;
    const before = draftOf(await fair.game(id));
    // A plain tile: the next offer comes; a mythic would pass it.
    const plain = Math.max(0, before.offer!.cards.findIndex((card) => !fairIsMythic(card)));
    await userEvent.click(within(offer).getAllByRole("button")[plain]!);
    expect(await screen.findByRole("list", { name: "Offer 2" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Your deck so far" })).toBeInTheDocument();
    await waitFor(async () => expect((await fair.game(id)).picks).toEqual([plain]), { timeout: slow(5000) });
  });

  it("opens the try's game once the last pick is taken", async () => {
    const ledger = newLedger();
    const record = await drafted(ledger, FAIR_OFFERS);
    const { router, fair } = open("/play/fair?view=draft", ledger);
    const offer = await screen.findByRole("list", { name: `Offer ${FAIR_OFFERS}` }, { timeout: slow(8000) });
    await userEvent.click(within(offer).getAllByRole("button")[0]!);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/fair/${record.id}`), { timeout: slow(8000) });
    expect(await fair.game(record.id)).toMatchObject({ stage: "game" });
  });

  it("leaves a try during its draft: it is spent, and the week shows the next one", async () => {
    const ledger = newLedger();
    const record = await drafted(ledger, 2);
    const { router, fair } = open("/play/fair?view=draft", ledger);
    await userEvent.click(await screen.findByRole("button", { name: "Leave this try" }, { timeout: slow(8000) }));
    await waitFor(() => expect(router.state.location.search).toBe(""), { timeout: slow(5000) });
    expect(await screen.findByRole("button", { name: "Start try 2" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(await fair.game(record.id)).toMatchObject({ stage: "abandoned", over: true });
  });

  it("sends the draft's view with no draft open back to the week, and one whose deck is built to its game", async () => {
    const { router } = open("/play/fair?view=draft");
    await waitFor(() => expect(router.state.location.search).toBe(""), { timeout: slow(8000) });
    expect(router.state.location.pathname).toBe("/play/fair");
    cleanup();
    await queryClient.cancelQueries();
    queryClient.clear();
    const ledger = newLedger();
    const record = await drafted(ledger);
    const built = open("/play/fair?view=draft", ledger);
    await waitFor(() => expect(built.router.state.location.pathname).toBe(`/fair/${record.id}`), { timeout: slow(8000) });
  });

  it("lists the week so far at ?view=ranking", async () => {
    open("/play/fair?view=ranking");
    expect(await screen.findByRole("list", { name: "Fair ranking" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ranking" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Reward tiers" })).toBeInTheDocument();
  });
});

describe("/fair/:gameId/over: a try's end", () => {
  it("shows a finished try's score and its place, and starts the next try's draft", async () => {
    const ledger = newLedger();
    const record = await drafted(ledger);
    await mockFair(ledger).play(PLAYER_ID, record.id, { kind: "surrender" });
    const { router, fair } = open(`/fair/${record.id}/over`, ledger);
    expect(await screen.findByText("Fair · try 1 of 3", undefined, { timeout: slow(8000) })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Week's place" })).toHaveTextContent("Counts from 1,000");
    await userEvent.click(screen.getByRole("button", { name: "Start a new try" }));
    await waitFor(() => expect(router.state.location.search).toBe("?view=draft"), { timeout: slow(5000) });
    expect((await fair.state(PLAYER_ID)).me).toMatchObject({ triesToday: 2, open: { stage: "draft" } });
  });

  it("sends a try left during its draft back to the week", async () => {
    const ledger = newLedger();
    const record = await drafted(ledger, 2);
    await mockFair(ledger).abandon(PLAYER_ID, record.id);
    const { router } = open(`/fair/${record.id}/over`, ledger);
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/fair"), { timeout: slow(8000) });
  });

  it("shows last week's result on Monday with the champion's deck", async () => {
    const ledger = newLedger();
    const record = await drafted(ledger);
    await mockFair(ledger).play(PLAYER_ID, record.id, { kind: "surrender" });
    vi.setSystemTime(new Date((fairEndsAt(WEEK) + 3_600) * 1000));
    open("/play/fair", ledger);
    const result = await screen.findByRole("region", { name: "Last week's Fair" }, { timeout: slow(8000) });
    // A surrendered try scores nothing: under the floor, no Cobbles.
    expect(within(result).getByRole("heading", { name: "Not counted" })).toBeInTheDocument();
    expect(within(result).getByRole("list", { name: "The champion's deck" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start try 1" })).toBeInTheDocument();
  });
});
