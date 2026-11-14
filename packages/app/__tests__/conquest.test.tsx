import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConquestWorld, ConquestZoneMap } from "../src/components/containers/conquest-map";
import { ConquestFinalEnd, ConquestMembers, ConquestPhaseEnd, ConquestRanks, rankedBy } from "../src/components/containers/conquest-ranks";
import { CONQUEST_TREE_COST, ConquestTree, conquestNextLevel, conquestSpent } from "../src/components/containers/conquest-tree";
import { PlayModes } from "../src/components/containers/play-modes";
import { ordinal } from "../src/components/elements/conquest-art";
import { ConquestScene, type ConquestSceneProps } from "../src/components/scenes/conquest-scene";
import { ConquestMapScene } from "../src/components/scenes/conquest-map-scene";
import { CONQUEST, CONQUEST_CARD, CONQUEST_MAP, CONQUEST_PARTS } from "../src/mocks/conquest";

// The Conquest's scenes (the season's finale) on their mocks: Play's card, the page through its phases, the results (a phase over,
// the Conquest over), the ranking and the members with their tabs, the requests, the tree, the map and a cell picked. The routes are
// `conquest-route.test.tsx`'s, the mock's rules `conquest-mock.test.ts`'s.

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
/** A view of the drawer, with its footer (Claim, the tabs): outside a drawer the footer is drawn in place. */
const inDrawer = (props: ConquestSceneProps) => wrap(<ConquestScene {...props} />);

describe("Play's Conquest card", () => {
  it("shows no card where the network has no Conquest", () => {
    render(wrap(<PlayModes spawnPaused={false} />));
    expect(screen.queryByRole("button", { name: "Conquest" })).toBeNull();
  });

  it("says the phase and its day, the allegiance's rank and the day's orders, with its own icon, and opens on a tap", async () => {
    const onConquest = vi.fn();
    render(wrap(<PlayModes spawnPaused={false} {...CONQUEST_CARD.playing} onConquest={onConquest} />));
    const { allegiance } = CONQUEST.hub.state;
    const button = screen.getByRole("button", { name: "Conquest" });
    expect(button).toHaveTextContent(`#${allegiance!.place} of ${allegiance!.of} · ${allegiance!.orders.left} order`);
    expect(screen.getByText("Limited · Awakening · Day 9")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: /left in Awakening$/ })).toBeInTheDocument();
    expect(document.querySelector('[data-mode="conquest"] img[src$="/mode-conquest.webp"]')).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(button);
    expect(onConquest).toHaveBeenCalledOnce();
  });

  it("counts the allegiances during the registration and for a player with none", () => {
    const { unmount } = render(wrap(<PlayModes spawnPaused={false} {...CONQUEST_CARD.registration} />));
    expect(screen.getByText("Limited · Registration")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: /left in the registration$/ })).toBeInTheDocument();
    unmount();
    render(wrap(<PlayModes spawnPaused={false} {...CONQUEST_CARD.noAllegiance} />));
    expect(screen.getByRole("button", { name: "Conquest" })).toHaveTextContent("6 allegiances share one world");
  });
});

describe("the Conquest's page", () => {
  it("shows the registration: the allegiance, one Register for an Officer, the allegiances registered", async () => {
    const onRegister = vi.fn();
    render(inDrawer({ ...CONQUEST.registration, onRegister }));
    expect(screen.getByText("Registration")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Before day 1" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("The world is drawn in 2d 22h");
    expect(CONQUEST.registration.state.entered).toBe(false);
    expect(document.querySelector("[data-slot=conquest-register]")).toHaveTextContent("Not registered yet.");
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(onRegister).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Registered" })).toBeInTheDocument();
    // No world yet: the map waits, and there is no ritual.
    expect(screen.getByRole("button", { name: "Map" })).toBeDisabled();
    expect(screen.queryByRole("list", { name: "Daily ritual" })).toBeNull();
  });

  it("shows a day of play as the proposal draws it: the phase, the allegiance, the orders, the ritual's three cards, the Knowledge", async () => {
    const on = { onOffer: vi.fn(), onZone: vi.fn(), onView: vi.fn(), onResult: vi.fn() };
    render(inDrawer({ ...CONQUEST.hub, ...on }));
    const { state } = CONQUEST.hub;
    expect(screen.getByText("Phase 2 · Awakening")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Day 9 of 20" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("5d 9h left · Frontiers opens on D15");
    expect(screen.getByRole("group", { name: "Your allegiance" })).toHaveTextContent(`#${state.allegiance!.place}`);
    expect(document.querySelector("[data-slot=conquest-allegiance]")).toHaveTextContent(`${state.allegiance!.members} members · you are an Officer`);
    expect(document.querySelector("[data-slot=conquest-orders]")).toHaveTextContent(`${state.allegiance!.orders.left} left · ${state.allegiance!.orders.given} received, ${state.allegiance!.orders.used} built`);
    // The ritual: three cards, what waits before each one's action, the action one word.
    const ritual = screen.getByRole("list", { name: "Daily ritual" });
    expect(ritual.children).toHaveLength(3);
    expect(state.me).toMatchObject({ days: 8, orderToday: false, exploredToday: false });
    const offering = ritual.querySelector("[data-slot=conquest-offering]")!;
    expect(offering).toHaveTextContent(`Offering${state.me!.waiting} waitingnext in`);
    expect(within(ritual).getAllByRole("button").map((b) => b.textContent)).toEqual(["Offer", "Explore", "Build"]);
    await userEvent.click(within(ritual).getByRole("button", { name: /^Offer: \d+ Knowledge$/ }));
    expect(on.onOffer).toHaveBeenCalledOnce();
    await userEvent.click(within(ritual).getByRole("button", { name: /^Explore/ }));
    expect(on.onZone).toHaveBeenLastCalledWith(state.home);
    const build = within(ritual).getByRole("button", { name: /^Build/ });
    if (state.requests.length === 0) expect(build).toBeDisabled();
    else {
      await userEvent.click(build);
      expect(on.onView).toHaveBeenLastCalledWith("requests");
    }
    // Foundation is over: its line opens its result.
    await userEvent.click(screen.getByRole("button", { name: /^Foundation is over/ }));
    expect(on.onResult).toHaveBeenLastCalledWith("foundation");
    const knowledge = document.querySelector("[data-slot=conquest-knowledge-row]") as HTMLElement;
    expect(knowledge).toHaveTextContent(`Knowledge ${state.allegiance!.knowledge.toLocaleString("en-US")}`);
    expect(knowledge).toHaveTextContent(/Next: \w+ level \d+ for [\d,]+/);
    await userEvent.click(knowledge);
    expect(on.onView).toHaveBeenLastCalledWith("tree");
    await userEvent.click(screen.getByRole("button", { name: /members$/ }));
    expect(on.onView).toHaveBeenLastCalledWith("members");
    await userEvent.click(screen.getByRole("button", { name: "Goals and rules" }));
    expect(on.onView).toHaveBeenLastCalledWith("rules");
    await userEvent.click(screen.getByRole("button", { name: "Ranks" }));
    expect(on.onView).toHaveBeenLastCalledWith("ranking");
    await userEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(on.onZone).toHaveBeenLastCalledWith(state.home);
  });

  it("says what the last act did", () => {
    render(inDrawer(CONQUEST.offered));
    expect(document.querySelector("[data-slot=conquest-notice]")).toHaveTextContent("Your first Offering of the day gave the allegiance one order.");
    expect(screen.getByText("+3 Knowledge")).toBeInTheDocument();
  });

  it("shows a rest day: nobody builds or explores, and the phase's result is one tap away", () => {
    render(inDrawer(CONQUEST.rest));
    expect(screen.getByText("Phase 1 · Foundation")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent(/^A rest day: nobody builds or explores · 14h( 0m)? left$/);
    const ritual = screen.getByRole("list", { name: "Daily ritual" });
    expect(within(ritual).getByRole("button", { name: /^Explore/ })).toBeDisabled();
    expect(document.querySelector("[data-slot=conquest-orders]")).toHaveTextContent("A rest day: nobody builds, no order is given.");
    expect(screen.getByRole("button", { name: /^Foundation is over/ })).toHaveTextContent(/Cobbles to claim/);
  });

  it("shows the results' days: the Conquest over and its three phases, no ritual", () => {
    render(inDrawer(CONQUEST.results));
    expect(screen.getByText("Results")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Day 22 of 28" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("The next registration opens in");
    expect(screen.getByRole("button", { name: /^The Conquest is over/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^(Foundation|Awakening|Frontiers) is over/ })).toHaveLength(3);
    expect(screen.queryByRole("list", { name: "Daily ritual" })).toBeNull();
  });

  it("sends a player with no allegiance to find one", async () => {
    const onAllegiance = vi.fn();
    render(inDrawer({ ...CONQUEST.noAllegiance, onAllegiance }));
    expect(screen.getByText("The Conquest is played by allegiances")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Your allegiance" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Find an allegiance" }));
    expect(onAllegiance).toHaveBeenCalledOnce();
  });

  it("waits while it is read, and says why it could not be", async () => {
    const onRetry = vi.fn();
    const { unmount } = render(wrap(<ConquestScene {...CONQUEST.loading} />));
    expect(screen.getByLabelText("Conquest")).toHaveAttribute("aria-busy", "true");
    unmount();
    render(wrap(<ConquestScene {...CONQUEST.failed} onRetry={onRetry} />));
    expect(screen.getByText("The Conquest could not be read.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("the Conquest's results", () => {
  it("shows a phase over: the emblem under its medal, the place, the podium, the viewer's part, then the Cobbles before one Claim", async () => {
    const onClaim = vi.fn();
    render(inDrawer({ ...CONQUEST.phaseOver, onClaim }));
    const phase = CONQUEST.phaseOver.state.results[0]!;
    const stage = screen.getByRole("region", { name: "Foundation is over" });
    expect(within(stage).getByRole("heading", { name: "Foundation is over" })).toBeInTheDocument();
    expect(stage).toHaveTextContent("D7 · Rest day");
    expect(stage.querySelector("[data-slot=conquest-result-place]")).toHaveTextContent(`${ordinal(phase.place)} of ${phase.of}`);
    expect(within(stage).getByRole("list", { name: "Podium" }).children).toHaveLength(3);
    const part = within(stage).getByRole("group", { name: "Your part" });
    expect(part).toHaveTextContent(`${phase.part.tiles}tile`);
    expect(part).toHaveTextContent(`${phase.part.knowledge}Knowledge`);
    expect(phase).toMatchObject({ days: 6, eligible: true, claimed: false });
    expect(stage.querySelector("[data-eligible=true]")).toHaveTextContent("Eligible: Offerings on 6 of the phase's days");
    expect(stage).toHaveTextContent("Next: Awakening, from day 8.");
    // The Cobbles are said before the button; the button is one word.
    expect(document.querySelector("[data-slot=conquest-reward]")).toHaveTextContent(`+${phase.cobbles}Cobbles`);
    const claim = screen.getByRole("button", { name: `Claim ${phase.cobbles} Cobbles` });
    expect(claim).toHaveTextContent(/^Claim$/);
    await userEvent.click(claim);
    expect(onClaim).toHaveBeenCalledWith(CONQUEST.phaseOver.state.conquest, "foundation");
  });

  it("shows the Conquest over: the crest, each phase's points and place, the final line, then the Cobbles before Claim", async () => {
    const on = { onClaim: vi.fn(), onView: vi.fn() };
    render(inDrawer({ ...CONQUEST.conquestOver, ...on }));
    const final = CONQUEST.conquestOver.state.final!;
    const stage = screen.getByRole("region", { name: "The Conquest is over" });
    expect(within(stage).getByRole("heading", { name: `${ordinal(final.place)} of World ${final.world}` })).toBeInTheDocument();
    const rows = within(stage).getAllByRole("row");
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual(["Foundation", "Awakening", "Frontiers", "Final"]);
    expect(rows[3]).toHaveTextContent(ordinal(final.place));
    expect(final).toMatchObject({ days: 13, eligible: true });
    if (final.crest) expect(stage.querySelector("[data-slot=conquest-crest]")).toHaveAttribute("data-crest", final.crest);
    await userEvent.click(screen.getByRole("button", { name: "See the final ranking" }));
    expect(on.onView).toHaveBeenLastCalledWith("ranking");
    const claim = screen.getByRole("button", { name: `Claim ${final.cobbles} Cobbles` });
    expect(claim).toHaveTextContent(/^Claim$/);
    await userEvent.click(claim);
    expect(on.onClaim).toHaveBeenCalledWith(final.conquest, "final");
  });

  it("says why a member short of days is not paid, and draws no crest past the podium", () => {
    const { unmount } = render(wrap(<ConquestPhaseEnd result={{ ...CONQUEST_PARTS.phase, days: 1, eligible: false, cobbles: 0 }} rest={false} next="Next: Awakening, from day 8." />));
    expect(document.querySelector("[data-eligible=false]")).toHaveTextContent("Not paid: Offerings on 1 of the phase's days (3 needed)");
    expect(screen.getByText("Since D7")).toBeInTheDocument();
    unmount();
    render(wrap(<ConquestFinalEnd final={{ ...CONQUEST_PARTS.final, place: 5, crest: null, days: 4, eligible: false }} last />));
    const stage = screen.getByRole("region", { name: "The last Conquest" });
    expect(stage.querySelector("[data-slot=conquest-crest]")).not.toHaveAttribute("data-crest");
    expect(stage).toHaveTextContent("finish 5th of 6");
    expect(stage.querySelector("[data-eligible=false]")).toHaveTextContent("Not paid: Offerings on 4 days (9 needed)");
  });

  it("counts places as words", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });
});

describe("the Conquest's ranking and members", () => {
  it("ranks the allegiances phase by phase from the foot's tabs, the podium wearing its medals, the viewer's own marked", async () => {
    render(inDrawer(CONQUEST.ranking));
    const { rows } = CONQUEST.ranking.ranking;
    // It opens on the phase under way.
    expect(screen.getByRole("tab", { name: "Awakening" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab").map((t) => t.getAttribute("aria-label") ?? t.textContent)).toEqual(["Foundation", "Awakening", "Frontiers", "Final"]);
    let list = screen.getByRole("list", { name: "Allegiances by Awakening's points" });
    expect(list.children).toHaveLength(6);
    expect(within(list).getAllByRole("img", { name: /^(1st|2nd|3rd)$/ })).toHaveLength(3);
    expect(list.querySelectorAll("[data-mine]")).toHaveLength(1);
    expect(list.querySelector("[data-mine]")).toHaveTextContent("The Quarrymenyour allegiance · 10 members");
    expect(screen.getByText(/The phase closes in/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Final" }));
    list = screen.getByRole("list", { name: "Allegiances by points" });
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent(rows[0]!.guild.name);
    await userEvent.click(screen.getByRole("tab", { name: "Foundation" }));
    expect(within(screen.getByRole("list", { name: "Allegiances by Foundation's points" })).getAllByRole("listitem")[0]).toHaveTextContent(rankedBy(rows, "foundation")[0]!.guild.name);
  });

  it("ranks a phase by its own points, a tie to the total's order", () => {
    const { rows } = CONQUEST_PARTS.ranking;
    const byPhase = rankedBy(rows, "foundation");
    expect(byPhase.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(byPhase.every((r, i) => i === 0 || byPhase[i - 1]!.points >= r.points)).toBe(true);
    expect(rankedBy(rows, "final").map((r) => r.points)).toEqual(rows.map((r) => r.total));
    render(wrap(<ConquestRanks rows={rows} by="frontiers" label="Frontiers" />));
    expect(screen.getByRole("list", { name: "Frontiers" }).children).toHaveLength(6);
  });

  it("lists the members with their avatar and rank, ranked by the foot's tab, and says whether the viewer is eligible", async () => {
    const onOpenPlayer = vi.fn();
    render(inDrawer({ ...CONQUEST.members, onOpenPlayer }));
    const members = CONQUEST.members.members;
    let list = screen.getByRole("list", { name: "Members by tiles given" });
    expect(list.children).toHaveLength(members.length);
    expect(list.querySelector("[data-me]")).toHaveTextContent("Officer");
    const best = [...members].sort((a, b) => b.tiles - a.tiles || b.knowledge - a.knowledge)[0]!;
    await userEvent.click(within(list).getAllByRole("button")[0]!);
    expect(onOpenPlayer).toHaveBeenCalledWith(best.profile.address);
    expect(document.querySelector("[data-slot=conquest-eligibility]")).toHaveTextContent("Offerings on 8 days so far (9 needed by D20)");
    await userEvent.click(screen.getByRole("tab", { name: "Knowledge" }));
    list = screen.getByRole("list", { name: "Members by Knowledge" });
    const wisest = [...members].sort((a, b) => b.knowledge - a.knowledge || b.tiles - a.tiles)[0]!;
    await userEvent.click(within(list).getAllByRole("button")[0]!);
    expect(onOpenPlayer).toHaveBeenLastCalledWith(wisest.profile.address);
    await userEvent.click(screen.getByRole("tab", { name: "Explored" }));
    expect(screen.getByRole("list", { name: "Members by cells explored" })).toBeInTheDocument();
    render(wrap(<ConquestMembers rows={members} by="explored" />));
  });
});

describe("the Conquest's requests, tree and rules", () => {
  it("lists the open requests: what each asks and pays before its one Give", async () => {
    const onGive = vi.fn();
    const state = CONQUEST.requests.state;
    const request = { id: 7, x: 30, y: 30, zone: state.home!, zoneName: "C3", plan: 1, orientation: 1, rarity: "common" as const, cobbles: 1, by: CONQUEST.members.members[0]!.profile, at: 0, held: 2, holders: 4 };
    render(inDrawer({ ...CONQUEST.requests, state: { ...state, requests: [request, { ...request, id: 8, held: 0 }], allegiance: { ...state.allegiance!, orders: { given: 3, used: 1, left: 2 } } }, onGive }));
    const rows = within(screen.getByRole("list", { name: "Open requests" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Common · 4 members hold one · you hold 2");
    expect(rows[0]).toHaveTextContent("+1 for the gift");
    const give = within(rows[0]!).getByRole("button", { name: /^Give .* for 1 Cobble$/ });
    expect(give).toHaveTextContent(/^Give$/);
    await userEvent.click(give);
    expect(onGive).toHaveBeenCalledWith(7);
    // A tile the viewer does not hold: nothing to give.
    expect(within(rows[1]!).getByRole("button", { name: /^Give/ })).toBeDisabled();
    expect(screen.getByRole("region", { name: "Requests" })).toHaveTextContent("2 orders left today.");
  });

  it("draws the tree: the Knowledge to spend, earned and spent, five branches, the cost before Buy", async () => {
    const onResearch = vi.fn();
    const levels = { roads: 0, cities: 4, forests: 10, wonders: 0, devotion: 9 };
    render(wrap(<ConquestTree levels={levels} knowledge={300} earned={8_500} leads open onResearch={onResearch} />));
    const head = document.querySelector("[data-slot=conquest-knowledge]")!;
    expect(head).toHaveTextContent("300Knowledge to spend");
    expect(head).toHaveTextContent("Earned8,500");
    expect(head).toHaveTextContent(`Spent${conquestSpent(levels).toLocaleString("en-US")}of 22,750`);
    expect(CONQUEST_TREE_COST).toBe(22_750);
    // Each figure wears the Knowledge's book.
    expect(head.querySelectorAll('img[src$="/conquest-knowledge.webp"]')).toHaveLength(3);
    const tree = screen.getByRole("list", { name: "Knowledge tree" });
    expect(tree.children).toHaveLength(5);
    expect(tree.querySelector("[data-branch=cities]")).toHaveTextContent("CitiesLevel 4 · +20% on the cities you win");
    expect(tree.querySelector("[data-branch=cities] [data-slot=conquest-cost]")).toHaveTextContent("250");
    expect(tree.querySelector("[data-branch=forests]")).toHaveTextContent("Complete");
    expect(tree.querySelector("[data-branch=devotion]")).toHaveTextContent("22 Offerings a day");
    // 1,400 for Devotion's last level: out of reach with 300.
    expect(screen.getByRole("button", { name: "Buy Devotion level 10 for 1,400 Knowledge" })).toBeDisabled();
    const buy = screen.getByRole("button", { name: "Buy Cities level 5 for 250 Knowledge" });
    expect(buy).toHaveTextContent(/^Buy$/);
    await userEvent.click(buy);
    expect(onResearch).toHaveBeenCalledWith("cities");
    expect(conquestNextLevel(levels)).toEqual({ branch: "roads", level: 1, cost: 40 });
    expect(conquestNextLevel({ roads: 10, cities: 10, forests: 10, wonders: 10, devotion: 10 })).toBeNull();
  });

  it("shows a member the tree without its buttons, and closes it past Frontiers", () => {
    const { unmount } = render(wrap(<ConquestTree {...CONQUEST_PARTS.treeMember} />));
    expect(screen.queryByRole("button")).toBeNull();
    unmount();
    render(wrap(<ConquestTree levels={{ roads: 0, cities: 0, forests: 0, wonders: 0, devotion: 0 }} knowledge={9_999} earned={9_999} leads open={false} />));
    expect(screen.getAllByRole("button").every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("shows the phase's goals and the rules", () => {
    render(inDrawer(CONQUEST.rules));
    expect(screen.getByRole("heading", { name: "Awakening" })).toBeInTheDocument();
    expect(screen.getByText(/The Great Wonders appear/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The rules" })).toBeInTheDocument();
  });
});

describe("the Conquest's map", () => {
  it("draws the world: a button a zone, the viewer's province marked, the free zones closed before Frontiers", async () => {
    const onZone = vi.fn();
    render(wrap(<ConquestWorld {...CONQUEST_PARTS.world} onZone={onZone} />));
    const world = screen.getByRole("group", { name: "The world" });
    expect(within(world).getAllByRole("button")).toHaveLength(25);
    expect(within(world).getAllByRole("button", { name: /a free zone, closed/ })).toHaveLength(12);
    const home = within(world).getByRole("button", { name: /your province, open/ });
    expect(home).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(world).getAllByRole("button", { name: /a free zone/ })[0]!);
    expect(onZone).toHaveBeenCalledOnce();
  });

  it("shows a zone eight cells by eight round the capital, and offers the exploration of a fog cell", async () => {
    const on = { onCell: vi.fn(), onExplore: vi.fn() };
    const { zone } = CONQUEST_PARTS.zone;
    const { rerender } = render(wrap(<ConquestZoneMap {...CONQUEST_PARTS.zone} {...on} />));
    const grid = screen.getByRole("grid", { name: /your province$/ });
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(64);
    expect(within(grid).getByRole("gridcell", { name: /your capital$/ })).toBeInTheDocument();
    expect(zone.canExplore).toBe(true);
    const fog = within(grid).getAllByRole("gridcell", { name: /: fog$/ })[0]!;
    await userEvent.click(fog);
    const cell = on.onCell.mock.calls[0]![0] as { x: number; y: number };
    expect(zone.explored.some((c) => c.x === cell.x && c.y === cell.y)).toBe(false);
    rerender(wrap(<ConquestZoneMap {...CONQUEST_PARTS.zone} {...on} cell={cell} />));
    expect(document.querySelector("[data-slot=conquest-action]")).toHaveTextContent("Nobody knows its Knowledge before: 5 (58%), 10 (26%), 20 (10%), 40 (4%), 100 (2%).");
    await userEvent.click(screen.getByRole("button", { name: "Explore" }));
    expect(on.onExplore).toHaveBeenCalledWith(cell);
    for (let i = 0; i < 5; i++) await userEvent.click(screen.getByRole("button", { name: "Move north" }));
    expect(screen.getByRole("button", { name: "Move north" })).toBeDisabled();
    expect(within(grid).queryByRole("gridcell", { name: /your capital$/ })).toBeNull();
  });

  it("lists the plans that fit a cell beside the allegiance's tiles, and asks for the one picked", async () => {
    const onRequest = vi.fn();
    const { cell, options } = CONQUEST_PARTS.zoneAsking;
    expect(cell).not.toBeNull();
    render(wrap(<ConquestZoneMap {...CONQUEST_PARTS.zoneAsking} onRequest={onRequest} />));
    const plans = within(screen.getByRole("list", { name: "Plans that fit" })).getAllByRole("button");
    expect(plans).toHaveLength(options!.plans.length);
    await userEvent.click(plans[0]!);
    await userEvent.click(screen.getByRole("button", { name: /^Ask for / }));
    expect(onRequest).toHaveBeenCalledWith({ ...cell!, plan: options!.plans[0]!.plan, orientation: options!.plans[0]!.orientations[0] });
  });

  it("leaves the requests to the Officers: a member's cells beside the tiles are not tapped", () => {
    render(wrap(<ConquestZoneMap {...CONQUEST_PARTS.zoneMember} />));
    expect(screen.queryByRole("gridcell", { name: /beside your tiles$/ })).toBeNull();
  });
});

describe("the Conquest's map scene", () => {
  it("opens on the viewer's province: its name, the day's orders, exploration and requests, the World button, no way home to take", async () => {
    const onWorld = vi.fn();
    render(wrap(<ConquestMapScene {...CONQUEST_MAP.home} onWorld={onWorld} />));
    const { state } = CONQUEST_MAP.home;
    expect(screen.getByRole("heading", { name: "My province" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot=conquest-zone-head]")).toHaveTextContent(`${state.zones[state.home!]!.name} · your province`);
    const chips = document.querySelector("[data-slot=conquest-map-chips]")!;
    expect(chips).toHaveTextContent(`${state.allegiance!.orders.left} order`);
    expect(chips).toHaveTextContent("1 exploration");
    expect(chips).toHaveTextContent(`${state.requests.length} request`);
    // Without the 3D board, the zone as a grid.
    expect(document.querySelector("[data-slot=conquest-map]")).toHaveAttribute("data-view", "grid");
    expect(screen.getByRole("grid", { name: /your province$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to my zone" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "World: the grid of the zones" }));
    expect(onWorld).toHaveBeenCalledWith(true);
  });

  it("names the zone under the view once it has left home, and offers the way back", async () => {
    const onHome = vi.fn();
    render(wrap(<ConquestMapScene {...CONQUEST_MAP.away} onHome={onHome} />));
    const { state, focus } = CONQUEST_MAP.away;
    expect(screen.getByRole("heading", { name: `Zone ${state.zones[focus]!.name}` })).toBeInTheDocument();
    expect(document.querySelector("[data-slot=conquest-zone-head]")).toHaveTextContent("a free zone");
    await userEvent.click(screen.getByRole("button", { name: "Back to my zone" }));
    expect(onHome).toHaveBeenCalledOnce();
  });

  it("opens the world's grid, and loads the zone tapped", async () => {
    const on = { onZone: vi.fn(), onWorld: vi.fn() };
    render(wrap(<ConquestMapScene {...CONQUEST_MAP.world} {...on} />));
    const dialog = screen.getByRole("dialog", { name: `World ${CONQUEST_MAP.world.state.world}` });
    const zones = within(within(dialog).getByRole("group", { name: "The world" })).getAllByRole("button");
    expect(zones).toHaveLength(25);
    await userEvent.click(zones[0]!);
    expect(on.onZone).toHaveBeenCalledOnce();
  });

  it("draws the 3D board when the page gives one, the picked cell's action at its foot", async () => {
    const onExplore = vi.fn();
    const { area } = CONQUEST_MAP.home;
    // A fog cell of the province.
    const explored = new Set(area.explored.map((c) => `${c.x},${c.y}`));
    const zone = CONQUEST_MAP.home.zone;
    const cell = { x: zone.x0, y: zone.y0 };
    expect(explored.has(`${cell.x},${cell.y}`)).toBe(false);
    render(wrap(<ConquestMapScene {...CONQUEST_MAP.home} canvas={<div data-testid="board" />} cell={cell} onExplore={onExplore} />));
    expect(document.querySelector("[data-slot=conquest-map]")).toHaveAttribute("data-view", "board");
    expect(screen.getByTestId("board")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
    expect(document.querySelector("[data-slot=conquest-action]")).toHaveTextContent("Nobody knows its Knowledge before:");
    await userEvent.click(screen.getByRole("button", { name: "Explore" }));
    expect(onExplore).toHaveBeenCalledWith(cell);
  });

  it("says whose tile a tapped tile is, and what the last act did", () => {
    const { area } = CONQUEST_MAP.home;
    const capital = area.tiles.find((t) => t.kind === "capital" && t.mine)!;
    const { unmount } = render(wrap(<ConquestMapScene {...CONQUEST_MAP.home} canvas={<div />} cell={{ x: capital.x, y: capital.y }} />));
    expect(document.querySelector("[data-slot=conquest-tile-info]")).toHaveTextContent("Your capital: your first tile.");
    unmount();
    render(wrap(<ConquestMapScene {...CONQUEST_MAP.explored} canvas={<div />} />));
    expect(document.querySelector("[data-slot=conquest-notice]")).toHaveTextContent("A rare find! The cell is open for building.");
  });

  it("waits for the world before day 1, and says why it could not be read", async () => {
    const onRetry = vi.fn();
    const { unmount } = render(wrap(<ConquestMapScene {...CONQUEST_MAP.registration} />));
    expect(screen.getByText("The world is drawn when day 1 begins.")).toBeInTheDocument();
    unmount();
    render(wrap(<ConquestMapScene {...CONQUEST_MAP.failed} onRetry={onRetry} />));
    expect(screen.getByText("The world could not be read.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
