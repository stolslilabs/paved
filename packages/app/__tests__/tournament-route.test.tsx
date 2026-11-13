import { slow } from "../test-slow";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOURNAMENT_ROUNDS, tournamentRoundEnd, tournamentRoundName, tournamentRoundStart, tournamentWeekOf, tournamentWeekStart } from "@paved/game-core";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { MockLedger } from "../src/data/mock/ledger";
import { mockTournament } from "../src/data/mock/overlay";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// The Tournament (the weekly individual event) on its routes, on a mock ledger's Tournament: Play's card, Monday's view and its
// Register, a day's duel and its Play, the bracket as a view, a game's end, the Cobbles' claim. The scenes' own states are
// `tournament.test.tsx`'s.

const WEEK = tournamentWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
/** Monday noon (the registration). `Date` alone is faked: the timers stay real for the waits. */
const MONDAY = new Date((tournamentWeekStart(WEEK) + 43_200) * 1000);
const noon = (round: number) => new Date((tournamentRoundStart(WEEK, round) + 43_200) * 1000);

const newLedger = () => new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });

/** The app at `path` on the fakes, the Tournament the ledger's; the wallet restores the mocks' player. */
function open(path: string, ledger = newLedger()) {
  const tournament = mockTournament(ledger);
  const f = fakeSources({ tournament });
  const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
  const router = createTestRouter(path);
  render(<App router={router} sources={f.sources} connector={wallet.load} />);
  return { router, tournament, ledger };
}

/** A ledger where the player registered on Monday, the clock moved to noon of their first duel's day; its round. */
async function drawn() {
  vi.setSystemTime(MONDAY);
  const ledger = newLedger();
  const tournament = mockTournament(ledger);
  await tournament.register(PLAYER_ID);
  for (let round = 1; round <= TOURNAMENT_ROUNDS; round++) {
    vi.setSystemTime(noon(round));
    if ((await tournament.state(PLAYER_ID)).run?.status === "to-play") return { ledger, tournament, round };
  }
  throw new Error("the player has no duel this week");
}

vi.mock("../src/routes/pages/board", async () => (await import("./route-helpers")).boardStandInModule);
preloadPages("home", "play", "over");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: MONDAY });
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

describe("/play: the Tournament's card in Limited", () => {
  it("shows the card where the network has a Tournament, and opens its view", async () => {
    const { router } = open("/play");
    const card = await screen.findByRole("button", { name: "Tournament" }, { timeout: slow(5000) });
    await waitFor(() => expect(card).toHaveTextContent("Registration is open today"), { timeout: slow(5000) });
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/tournament"));
    expect(await screen.findByRole("button", { name: "Register" }, { timeout: slow(8000) })).toBeInTheDocument();
  });

  it("shows no card without one (the chain)", async () => {
    const f = fakeSources();
    render(<App router={createTestRouter("/play")} sources={f.sources} connector={fakeWallet({ address: PLAYER_ID, restored: true }).load} />);
    expect(await screen.findByRole("button", { name: /^Training/ }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tournament" })).not.toBeInTheDocument();
  });
});

describe("/play/tournament: the week", () => {
  it("registers the player on Monday", async () => {
    const { tournament } = open("/play/tournament");
    await userEvent.click(await screen.findByRole("button", { name: "Register" }, { timeout: slow(8000) }));
    expect(await screen.findByText(/You are registered/, undefined, { timeout: slow(5000) })).toBeInTheDocument();
    expect((await tournament.state(PLAYER_ID)).registered).toBe(true);
  });

  it("reads the week again at Tuesday 00:00 UTC while it is open: the registered player's bracket comes", async () => {
    vi.setSystemTime(MONDAY);
    const ledger = newLedger();
    await mockTournament(ledger).register(PLAYER_ID);
    // Two seconds before the draw: the timer to midnight is real, `Date` is moved past it once the registration is shown.
    vi.setSystemTime(new Date((tournamentRoundStart(WEEK, 1) - 2) * 1000));
    open("/play/tournament", ledger);
    expect(await screen.findByText(/You are registered/, undefined, { timeout: slow(8000) })).toBeInTheDocument();
    vi.setSystemTime(new Date((tournamentRoundStart(WEEK, 1) + 1) * 1000));
    expect(await screen.findByRole("button", { name: "The bracket" }, { timeout: slow(8000) })).toBeInTheDocument();
  });

  it("starts the day's game from the duel, and shows the bracket as its view", async () => {
    const { ledger, round } = await drawn();
    const { router, tournament } = open("/play/tournament", ledger);
    await userEvent.click(await screen.findByRole("button", { name: "The bracket" }, { timeout: slow(8000) }));
    await waitFor(() => expect(router.state.location.search).toBe(`?view=bracket&week=${WEEK}`));
    expect(await screen.findByRole("region", { name: "Your path" })).toHaveTextContent(tournamentRoundName(round));
    expect(screen.getByRole("heading", { name: "Bracket" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(await screen.findByRole("button", { name: "Play" }, { timeout: slow(5000) }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/tournament\/\d+$/), { timeout: slow(5000) });
    const id = Number(router.state.location.pathname.split("/").pop());
    expect((await tournament.state(PLAYER_ID)).run?.open).toMatchObject({ id });
  });

  it("opens last week's bracket from its unclaimed result, this week's from the footer, once this week's is drawn", async () => {
    const { ledger, tournament } = await drawn();
    const game = await tournament.start(PLAYER_ID);
    await tournament.play(PLAYER_ID, game.id, { kind: "surrender" });
    // Next Monday: registered again, last week's Cobbles left unclaimed; Tuesday noon, this week's bracket is drawn.
    vi.setSystemTime(new Date((tournamentWeekStart(WEEK + 1) + 43_200) * 1000));
    await tournament.register(PLAYER_ID);
    vi.setSystemTime(new Date((tournamentRoundStart(WEEK + 1, 1) + 43_200) * 1000));
    const state = await tournament.state(PLAYER_ID);
    expect(state.run).toMatchObject({ week: WEEK + 1 });
    expect(state.last).toMatchObject({ week: WEEK, status: "out", claimable: true });
    const { router } = open("/play/tournament", ledger);
    const last = await screen.findByRole("region", { name: "Last week" }, { timeout: slow(8000) });
    await userEvent.click(within(last).getByRole("button", { name: "The bracket" }));
    await waitFor(() => expect(router.state.location.search).toBe(`?view=bracket&week=${WEEK}`));
    // Last week's path, to the round it ended in.
    const path = await screen.findByRole("region", { name: "Your path" });
    expect(path.querySelectorAll("li")).toHaveLength(state.last!.path.length);
    expect(path.querySelector("li:last-child")).toHaveAttribute("data-outcome", "lost");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    const lastAgain = await screen.findByRole("region", { name: "Last week" }, { timeout: slow(5000) });
    // The footer's: this week's, its first round still to decide.
    await userEvent.click(screen.getAllByRole("button", { name: "The bracket" }).find((b) => !lastAgain.contains(b))!);
    await waitFor(() => expect(router.state.location.search).toBe(`?view=bracket&week=${WEEK + 1}`));
    const current = await screen.findByRole("region", { name: "Your path" });
    expect(current.querySelectorAll("li")).toHaveLength(state.run!.path.length);
    expect(current.querySelector('li[data-outcome="lost"]')).toBeNull();
  });

  it("tells a player who did not register that the week is drawn without them", async () => {
    vi.setSystemTime(noon(2));
    open("/play/tournament");
    expect(await screen.findByText(/You did not register on Monday/, undefined, { timeout: slow(8000) })).toBeInTheDocument();
  });
});

describe("/tournament/:gameId/over: a game's end", () => {
  it("shows a finished game's round and its standing, and goes back to the tournament", async () => {
    const { ledger, tournament, round } = await drawn();
    const game = await tournament.start(PLAYER_ID);
    await tournament.play(PLAYER_ID, game.id, { kind: "surrender" });
    const { router } = open(`/tournament/${game.id}/over`, ledger);
    expect(await screen.findByText(`Tournament · ${tournamentRoundName(round)}`, undefined, { timeout: slow(8000) })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Cobbles" })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "The tournament" }).at(-1)!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/tournament"), { timeout: slow(5000) });
  });

  it("sends a game still open back to its board", async () => {
    const { ledger, tournament } = await drawn();
    const game = await tournament.start(PLAYER_ID);
    const { router } = open(`/tournament/${game.id}/over`, ledger);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/tournament/${game.id}`), { timeout: slow(8000) });
  });

  it("shows a run that is over the day after, and claims its Cobbles", async () => {
    const { ledger, tournament, round } = await drawn();
    const game = await tournament.start(PLAYER_ID);
    // A surrendered game scores nothing: it loses to any game, and still goes through when nobody played opposite.
    await tournament.play(PLAYER_ID, game.id, { kind: "surrender" });
    // The day after the run's last match: this week's while it lasts, else last week's on Monday.
    let at = tournamentRoundEnd(WEEK, round) + 3_600;
    vi.setSystemTime(new Date(at * 1000));
    while ((await tournament.state(PLAYER_ID)).run?.status === "to-play") {
      at += 86_400;
      vi.setSystemTime(new Date(at * 1000));
    }
    open("/play/tournament", ledger);
    const claim = await screen.findByRole("button", { name: /^Claim \+\d+ Cobbles$/ }, { timeout: slow(8000) });
    const before = (await ledger.account(PLAYER_ID)).cobbles;
    await userEvent.click(claim);
    await waitFor(async () => expect((await ledger.account(PLAYER_ID)).cobbles).toBeGreaterThan(before), { timeout: slow(5000) });
    expect(await screen.findByText(/Cobbles claimed/, undefined, { timeout: slow(5000) })).toBeInTheDocument();
  });
});
