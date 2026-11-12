import { slow } from "../test-slow";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { joustEndsAt, joustOpensAt, joustWeekOf, joustWeekStart, type GuildDraft } from "@paved/game-core";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { MockLedger } from "../src/data/mock/ledger";
import { mockJoust, mockSocial } from "../src/data/mock/overlay";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// The Joust (the weekly allegiance event) on its routes, on a mock ledger's Joust: Play's card, the week's view and its Register, the
// live match and its Play, both top 10 and the ranking as views, a game's end. The scenes' own states are `joust.test.tsx`'s.

const WEEK = joustWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
/** Tuesday noon (the registration) and Saturday noon (the joust). `Date` alone is faked: the timers stay real for the waits. */
const TUESDAY = new Date((joustWeekStart(WEEK) + 86_400 + 43_200) * 1000);
const SATURDAY = new Date((joustOpensAt(WEEK) + 86_400 + 43_200) * 1000);
const draft: GuildDraft = { name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "open", requirements: { level: 0, crowns: 0 } };

const newLedger = () => new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });

/** The app at `path` on the fakes, the Joust and the guilds the ledger's; the wallet restores the mocks' player. */
function open(path: string, ledger = newLedger()) {
  const joust = mockJoust(ledger);
  const f = fakeSources({ joust, social: mockSocial(ledger) });
  const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
  const router = createTestRouter(path);
  render(<App router={router} sources={f.sources} connector={wallet.load} />);
  return { router, joust, ledger };
}

/** A ledger where the player leads a registered allegiance, set up on Tuesday. */
async function registered() {
  vi.setSystemTime(TUESDAY);
  const ledger = newLedger();
  await mockSocial(ledger).createGuild(PLAYER_ID, draft);
  await mockJoust(ledger).register(PLAYER_ID);
  return ledger;
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
  // The app is unmounted and its reads are stopped before the cache is cleared: a page still mounted over a cleared cache reads again
  // from its own test's ledger, and the next test's page, on the same key, would join that read and show its answer (the failure of
  // "registers the Leader's allegiance": the test before it left a ledger with no allegiance).
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("/play: the Joust's card in Limited", () => {
  it("shows the card where the network has a Joust, and opens its view", async () => {
    const { router } = open("/play");
    const card = await screen.findByRole("button", { name: "Joust" }, { timeout: slow(5000) });
    await waitFor(() => expect(card).toHaveTextContent("Join an allegiance to joust"), { timeout: slow(5000) });
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/joust"));
    expect(await screen.findByRole("button", { name: "Find an allegiance" }, { timeout: slow(8000) })).toBeInTheDocument();
  });
});

describe("/play/joust: the week", () => {
  it("registers the Leader's allegiance during the registration", async () => {
    const ledger = newLedger();
    await mockSocial(ledger).createGuild(PLAYER_ID, draft);
    const { joust } = open("/play/joust", ledger);
    await userEvent.click(await screen.findByRole("button", { name: "Register Stone Road" }, { timeout: slow(8000) }));
    expect(await screen.findByText(/Stone Road is registered/, undefined, { timeout: slow(5000) })).toBeInTheDocument();
    expect((await joust.state(PLAYER_ID)).registered).toBe(true);
  });

  it("starts the player's game from the live match, and shows both top 10 and the ranking as its views", async () => {
    const ledger = await registered();
    vi.setSystemTime(SATURDAY);
    const { router, joust } = open("/play/joust", ledger);
    await userEvent.click(await screen.findByRole("button", { name: "Both top 10" }, { timeout: slow(8000) }));
    await waitFor(() => expect(router.state.location.search).toBe("?view=top"));
    expect(await screen.findByRole("region", { name: "Stone Road's top 10" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Both top 10" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(await screen.findByRole("button", { name: "Play game 1" }, { timeout: slow(5000) }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/joust\/\d+$/), { timeout: slow(5000) });
    const id = Number(router.state.location.pathname.split("/").pop());
    expect((await joust.state(PLAYER_ID)).me?.open).toMatchObject({ id });
  });

  it("lists the allegiances by rating at ?view=ranking", async () => {
    open("/play/joust?view=ranking");
    expect(await screen.findByRole("list", { name: "Joust ranking" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ranking" })).toBeInTheDocument();
  });
});

describe("/joust/:gameId/over: a game's end", () => {
  it("shows a finished game's score, its allegiance's total and the next game", async () => {
    const ledger = await registered();
    vi.setSystemTime(SATURDAY);
    const joust = mockJoust(ledger);
    const game = await joust.start(PLAYER_ID);
    await joust.play(PLAYER_ID, game.id, { kind: "surrender" });
    const { router } = open(`/joust/${game.id}/over`, ledger);
    expect(await screen.findByText("Joust · game 1 of 3", undefined, { timeout: slow(8000) })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Allegiance total" })).toHaveTextContent("Unchanged");
    await userEvent.click(screen.getByRole("button", { name: "Play game 2" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/joust\/\d+$/), { timeout: slow(5000) });
    expect(router.state.location.pathname).not.toBe(`/joust/${game.id}`);
  });

  it("shows last week's result on Monday, and claims its Cobbles", async () => {
    const ledger = await registered();
    vi.setSystemTime(SATURDAY);
    const joust = mockJoust(ledger);
    const game = await joust.start(PLAYER_ID);
    await joust.play(PLAYER_ID, game.id, { kind: "surrender" });
    vi.setSystemTime(new Date((joustEndsAt(WEEK) + 3_600) * 1000));
    open("/play/joust", ledger);
    const claim = await screen.findByRole("button", { name: /^Claim \+\d+ Cobbles$/ }, { timeout: slow(8000) });
    const before = (await ledger.account(PLAYER_ID)).cobbles;
    await userEvent.click(claim);
    await waitFor(async () => expect((await ledger.account(PLAYER_ID)).cobbles).toBeGreaterThan(before), { timeout: slow(5000) });
    expect(await screen.findByText(/Cobbles claimed/, undefined, { timeout: slow(5000) })).toBeInTheDocument();
  });
});
