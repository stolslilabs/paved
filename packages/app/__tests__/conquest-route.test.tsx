import { slow } from "../test-slow";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conquestDayStart, conquestOf, conquestStart, type GuildDraft } from "@paved/game-core";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { forgetConquests } from "../src/data/mock/conquest";
import { seededGuildWorld } from "../src/data/mock/guilds";
import { MockLedger } from "../src/data/mock/ledger";
import { mockConquest, mockSocial } from "../src/data/mock/overlay";
import { PLAYER_ID } from "../src/mocks/players";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// The Conquest (the season's finale) on its route, on a mock ledger's Conquest: Play's card, the page of a member (the Offerings,
// the day's exploration on the map), the tree, the ranking and the members, a player with no allegiance, and a Leader's
// registration. The scenes' own states are `conquest.test.tsx`'s, the rules' `conquest-mock.test.ts`'s.

const N = conquestOf(Date.parse("2026-11-14T12:00:00Z") / 1000);
/** Awakening's day 9 at noon. `Date` alone is faked: the timers stay real for the waits. */
const DAY_9 = new Date((conquestDayStart(N, 9) + 43_200) * 1000);
const QUARRYMEN = seededGuildWorld().guilds[0]!;
const draft: GuildDraft = { name: "Stone Road", emblem: { icon: 1, primary: 2, secondary: 3 }, description: "We pave.", joinType: "open", requirements: { level: 0, crowns: 0 } };

const newLedger = () => new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });

/** A ledger whose player joined the Quarrymen (at the clock's time). */
async function member() {
  const ledger = newLedger();
  await mockSocial(ledger).joinGuild(PLAYER_ID, QUARRYMEN.id);
  return ledger;
}

/** The app at `path` on the fakes, the Conquest the ledger's (none: the chain's sources, no Conquest); the wallet restores the mocks' player. */
function open(path: string, ledger: MockLedger | null = newLedger()) {
  const conquest = ledger ? mockConquest(ledger) : null;
  const f = fakeSources({ conquest });
  const wallet = fakeWallet({ address: PLAYER_ID, restored: true });
  const router = createTestRouter(path);
  render(<App router={router} sources={f.sources} connector={wallet.load} />);
  return { router, conquest, ledger };
}

preloadPages("home", "play", "conquest-map");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: DAY_9 });
  forgetConquests();
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

describe("/play: the Conquest's card in Limited", () => {
  it("shows the card where the network has a Conquest, and opens its page", async () => {
    const { router } = open("/play", await member());
    const card = await screen.findByRole("button", { name: "Conquest" }, { timeout: slow(8000) });
    await waitFor(() => expect(card).toHaveTextContent(/#\d of 6 · \d+ orders? · 12 Offerings/), { timeout: slow(5000) });
    expect(screen.getByText("Limited · Awakening · Day 9")).toBeInTheDocument();
    await userEvent.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/conquest"));
    expect(await screen.findByRole("heading", { name: "Day 9 of 20" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Conquest" })).toBeInTheDocument();
  });

  it("shows no card on the chain's sources", async () => {
    open("/play", null);
    expect(await screen.findByRole("button", { name: /^Training/ }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conquest" })).toBeNull();
  });
});

describe("/play/conquest: a member's day", () => {
  it("makes the Offerings that wait, then explores a cell of the province on the map", async () => {
    const { router, conquest } = open("/play/conquest", await member());
    const offer = await screen.findByRole("button", { name: "Offer: 12 Knowledge" }, { timeout: slow(8000) });
    await userEvent.click(offer);
    await waitFor(() => expect(document.querySelector("[data-slot=conquest-notice]")).toHaveTextContent("Your Offerings are made."), { timeout: slow(8000) });
    await waitFor(() => expect(document.querySelector("[data-slot=conquest-offering]")).toHaveTextContent("0 waiting"), { timeout: slow(5000) });
    expect((await conquest!.state(PLAYER_ID)).me).toMatchObject({ days: 1, knowledge: 12 });
    // The day's exploration: the map of the province, a fog cell, Explore.
    await userEvent.click(screen.getByRole("button", { name: /^Explore:/ }));
    // The map is a page of its own; without WebGL here, the province as a grid.
    await waitFor(() => expect(router.state.location.pathname).toBe("/conquest"));
    expect(router.state.location.search).toMatch(/^\?zone=\d+$/);
    const grid = await screen.findByRole("grid", { name: /your province$/ }, { timeout: slow(8000) });
    expect(screen.getByRole("heading", { name: "My province" })).toBeInTheDocument();
    await userEvent.click(within(grid).getAllByRole("gridcell", { name: /: fog$/ })[0]!);
    await userEvent.click(await screen.findByRole("button", { name: "Explore" }));
    await waitFor(() => expect(document.querySelector("[data-slot=conquest-notice]")).toHaveTextContent(/The cell is|A rare find/), { timeout: slow(8000) });
    expect((await conquest!.state(PLAYER_ID)).me).toMatchObject({ exploredToday: true, explored: 1 });
    // The exploration made: no fog cell is tapped any more.
    await waitFor(() => expect(within(grid).queryAllByRole("gridcell", { name: /: fog$/ }).every((c) => c.tagName === "SPAN")).toBe(true), { timeout: slow(5000) });
    // The World grid loads another zone's scene; Back to my zone returns.
    await userEvent.click(screen.getByRole("button", { name: "World: the grid of the zones" }));
    const world = within(await screen.findByRole("dialog")).getByRole("group", { name: "The world" });
    await userEvent.click(within(world).getAllByRole("button", { name: /a free zone/ })[0]!);
    await waitFor(() => expect(screen.getByRole("heading", { name: /^Zone [A-E][1-5]$/ })).toBeInTheDocument(), { timeout: slow(8000) });
    const away = router.state.location.search;
    await userEvent.click(await screen.findByRole("button", { name: "Back to my zone" }));
    await waitFor(() => expect(router.state.location.search).not.toBe(away));
    expect(await screen.findByRole("heading", { name: "My province" }, { timeout: slow(8000) })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/conquest"));
    expect(await screen.findByRole("heading", { name: "Day 9 of 20" }, { timeout: slow(5000) })).toBeInTheDocument();
  });

  it("shows the tree, the ranking and the members at ?view=, each named on the header", async () => {
    const ledger = await member();
    const { router } = open("/play/conquest?view=tree", ledger);
    expect(await screen.findByRole("list", { name: "Knowledge tree" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Knowledge tree" })).toBeInTheDocument();
    // A member reads the tree: no level to buy.
    expect(screen.getByText(/The Leader and the Officers buy the levels/)).toBeInTheDocument();
    await router.navigate("/play/conquest?view=ranking");
    expect((await screen.findByRole("list", { name: "Allegiances by Awakening's points" }, { timeout: slow(8000) })).children).toHaveLength(6);
    await userEvent.click(screen.getByRole("tab", { name: "Final" }));
    expect(await screen.findByRole("list", { name: "Allegiances by points" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ranking" })).toBeInTheDocument();
    await router.navigate("/play/conquest?view=members");
    expect((await screen.findByRole("list", { name: "Members by tiles given" }, { timeout: slow(8000) })).children).toHaveLength(QUARRYMEN.members.length + 1);
    expect(screen.getByRole("heading", { name: "Our members" })).toBeInTheDocument();
    // Foundation's result, by its address: the phase is over, the member joined after it and is not paid.
    await router.navigate("/play/conquest?view=result&of=foundation");
    expect(await screen.findByRole("region", { name: "Foundation is over" }, { timeout: slow(8000) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim 0 Cobbles" })).toBeDisabled();
  });

  it("sends a player with no allegiance to the Allegiance page", async () => {
    const { router } = open("/play/conquest");
    await userEvent.click(await screen.findByRole("button", { name: "Find an allegiance" }, { timeout: slow(8000) }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/guild"));
  });

  it("says the Conquest is not on the chain's network", async () => {
    open("/play/conquest", null);
    expect(await screen.findByText("The Conquest is not on this network yet.", undefined, { timeout: slow(8000) })).toBeInTheDocument();
  });
});

describe("/play/conquest: the registration", () => {
  it("registers the Leader's allegiance", async () => {
    vi.setSystemTime(new Date((conquestStart(N + 1) + 3_600) * 1000));
    const ledger = newLedger();
    await mockSocial(ledger).createGuild(PLAYER_ID, draft);
    const { conquest } = open("/play/conquest", ledger);
    expect(await screen.findByRole("heading", { name: "Before day 1" }, { timeout: slow(8000) })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Register" }));
    await waitFor(() => expect(document.querySelector("[data-slot=conquest-register]")).toHaveTextContent("Registered: its province is drawn when day 1 begins."), { timeout: slow(8000) });
    expect((await conquest!.state(PLAYER_ID)).entered).toBe(true);
    expect(within(screen.getByRole("list", { name: "Allegiances registered" })).getByText("Stone Road")).toBeInTheDocument();
  });
});
