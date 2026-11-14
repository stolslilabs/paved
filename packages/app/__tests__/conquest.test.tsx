import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConquestWorld, ConquestZoneMap } from "../src/components/containers/conquest-map";
import { ConquestFinalCard, ConquestPhaseCard } from "../src/components/containers/conquest-ranks";
import { ConquestTree } from "../src/components/containers/conquest-tree";
import { PlayModes } from "../src/components/containers/play-modes";
import { ConquestScene } from "../src/components/scenes/conquest-scene";
import { CONQUEST, CONQUEST_CARD, CONQUEST_PARTS } from "../src/mocks/conquest";

// The Conquest's scenes (the season's finale) on their mocks: Play's card, the page through its phases, the map and a cell picked,
// the knowledge tree, the ranking, the members and the results. The routes are `conquest-route.test.tsx`'s, the mock's rules
// `conquest-mock.test.ts`'s.

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

describe("Play's Conquest card", () => {
  it("shows no card where the network has no Conquest", () => {
    render(wrap(<PlayModes spawnPaused={false} />));
    expect(screen.queryByRole("button", { name: "Conquest" })).toBeNull();
  });

  it("says the phase and its day, the allegiance's rank and the day's orders, with the phase's time left, and opens on a tap", async () => {
    const onConquest = vi.fn();
    render(wrap(<PlayModes spawnPaused={false} {...CONQUEST_CARD.playing} onConquest={onConquest} />));
    const { allegiance } = CONQUEST.hub.state;
    const button = screen.getByRole("button", { name: "Conquest" });
    expect(button).toHaveTextContent(`#${allegiance!.place} of ${allegiance!.of} · ${allegiance!.orders.left} order`);
    expect(screen.getByText("Limited · Awakening · Day 9")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: /left in Awakening$/ })).toBeInTheDocument();
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
  it("shows the registration: the allegiance, Register for an Officer, the allegiances registered", async () => {
    const onRegister = vi.fn();
    render(wrap(<ConquestScene {...CONQUEST.registration} onRegister={onRegister} />));
    const { state } = CONQUEST.registration;
    expect(screen.getByRole("heading", { name: "Registration" })).toBeInTheDocument();
    expect(screen.getByText("Before day 1")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("The world is drawn in 2d 22h");
    expect(state.entered).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(onRegister).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Registered" })).toBeInTheDocument();
    // No world yet: the map waits.
    expect(screen.getByRole("button", { name: "Map" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Daily ritual" })).toBeNull();
  });

  it("shows a day of play: the allegiance's figures, the daily ritual, the requests, the results so far, the briefing and the rules", async () => {
    const on = { onOffer: vi.fn(), onZone: vi.fn(), onView: vi.fn(), onGive: vi.fn() };
    render(wrap(<ConquestScene {...CONQUEST.hub} {...on} />));
    const { state } = CONQUEST.hub;
    expect(screen.getByRole("heading", { name: "Awakening" })).toBeInTheDocument();
    expect(screen.getByText("Day 9 of 28")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("The phase ends in 5d 9h");
    const figures = screen.getByRole("group", { name: "Your allegiance" });
    expect(figures).toHaveTextContent(`#${state.allegiance!.place}of ${state.allegiance!.of}`);
    expect(figures).toHaveTextContent("Knowledge");
    // The viewer offered every evening: the Offerings since wait.
    expect(state.me).toMatchObject({ days: 8, orderToday: false, exploredToday: false });
    expect(state.me!.waiting).toBeGreaterThan(0);
    const offering = document.querySelector("[data-slot=conquest-offering]")!;
    expect(offering).toHaveTextContent(`${state.me!.waiting} Offerings wait`);
    expect(offering).toHaveTextContent("your first gives an order");
    await userEvent.click(within(offering as HTMLElement).getByRole("button", { name: /^Offer/ }));
    expect(on.onOffer).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Explore" }));
    expect(on.onZone).toHaveBeenLastCalledWith(state.home);
    expect(document.querySelector("[data-slot=conquest-orders]")).toHaveTextContent(`${state.allegiance!.orders.left} order`);
    expect(screen.getByRole("heading", { name: "Requests" })).toBeInTheDocument();
    for (const r of state.requests) expect(document.querySelector(`li[data-request="${r.id}"]`)).toHaveTextContent(r.zoneName);
    // Foundation is over: its result is shown, and its Cobbles wait.
    expect(screen.getByRole("region", { name: "End of Foundation" })).toHaveTextContent(`#${state.results[0]!.place} of 6`);
    expect(screen.getByRole("heading", { name: "Briefing" })).toBeInTheDocument();
    expect(screen.getByText(/The Great Wonders appear/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The rules" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ranking" }));
    expect(on.onView).toHaveBeenLastCalledWith("ranking");
    await userEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(on.onView).toHaveBeenLastCalledWith("tree");
    await userEvent.click(screen.getByRole("button", { name: "Members" }));
    expect(on.onView).toHaveBeenLastCalledWith("members");
    await userEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(on.onZone).toHaveBeenLastCalledWith(state.home);
  });

  it("says what the last act did", () => {
    render(wrap(<ConquestScene {...CONQUEST.offered} />));
    expect(document.querySelector("[data-slot=conquest-notice]")).toHaveTextContent("Your first Offering of the day gave the allegiance one order.");
    expect(screen.getByText("+3 Knowledge")).toBeInTheDocument();
  });

  it("shows a rest day: nobody builds or explores, the phase's result is in and claimed with one tap", async () => {
    const onClaim = vi.fn();
    render(wrap(<ConquestScene {...CONQUEST.rest} onClaim={onClaim} />));
    const { state } = CONQUEST.rest;
    expect(screen.getByRole("heading", { name: "Foundation" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("A rest day: nobody builds or explores. The next phase begins in 14h");
    expect(document.querySelector("[data-slot=conquest-exploration]")).toHaveTextContent("Nobody explores on a rest day");
    const result = screen.getByRole("region", { name: "End of Foundation" });
    expect(within(result).getByRole("list", { name: "Foundation's podium" }).children).toHaveLength(3);
    // Six evenings of Offerings so far: the seventh is tonight.
    expect(state.results[0]).toMatchObject({ days: 6, eligible: true, claimed: false });
    await userEvent.click(screen.getByRole("button", { name: `Claim +${state.toClaim} Cobbles` }));
    expect(onClaim).toHaveBeenCalledWith(state.conquest);
  });

  it("shows the results: the final rank, the crest of the podium, the three phases, and Claim", async () => {
    const onClaim = vi.fn();
    render(wrap(<ConquestScene {...CONQUEST.results} onClaim={onClaim} />));
    const { state } = CONQUEST.results;
    const final = state.final!;
    expect(screen.getByRole("heading", { name: "Results" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("The next Conquest's registration opens in");
    const card = screen.getByRole("region", { name: "This Conquest" });
    expect(card).toHaveTextContent(`#${final.place} of ${final.of}`);
    expect(final).toMatchObject({ days: 13, eligible: true });
    expect(screen.getAllByRole("region", { name: /^End of / })).toHaveLength(3);
    // The ritual and the requests are over.
    expect(screen.queryByRole("heading", { name: "Daily ritual" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Requests" })).toBeNull();
    await userEvent.click(within(card).getByRole("button", { name: `Claim +${final.toClaim} Cobbles` }));
    expect(onClaim).toHaveBeenCalledWith(final.conquest);
  });

  it("sends a player with no allegiance to find one", async () => {
    const onAllegiance = vi.fn();
    render(wrap(<ConquestScene {...CONQUEST.noAllegiance} onAllegiance={onAllegiance} />));
    expect(screen.getByText("The Conquest is played by allegiances")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Your allegiance" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Find an allegiance" }));
    expect(onAllegiance).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Tree" })).toBeDisabled();
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
    // The arrows move the window.
    await userEvent.click(screen.getByRole("button", { name: "Move north" }));
    expect(within(grid).queryByRole("gridcell", { name: /your capital$/ })).toBeInTheDocument();
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: "Move north" }));
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
    expect(screen.getByText(/Pick the tile to ask for/)).toBeInTheDocument();
    await userEvent.click(plans[0]!);
    await userEvent.click(screen.getByRole("button", { name: "Ask for it" }));
    expect(onRequest).toHaveBeenCalledWith({ ...cell!, plan: options!.plans[0]!.plan, orientation: options!.plans[0]!.orientations[0] });
  });

  it("leaves the requests to the Officers: a member's cells beside the tiles are not tapped", () => {
    render(wrap(<ConquestZoneMap {...CONQUEST_PARTS.zoneMember} />));
    expect(screen.queryByRole("gridcell", { name: /beside your tiles$/ })).toBeNull();
    expect(document.querySelector("[data-slot=conquest-action]")).toHaveTextContent("Tap a fog cell to explore it, or a framed tile to give it.");
  });

  it("names the zone and the orders left over the map", () => {
    render(wrap(<ConquestScene {...CONQUEST.map} />));
    const head = document.querySelector("[data-slot=conquest-zone-head]")!;
    expect(head).toHaveTextContent(`${CONQUEST.map.zone.zone.name} · your province`);
    expect(head).toHaveTextContent("left");
    expect(screen.getByRole("group", { name: "The world" })).toBeInTheDocument();
  });
});

describe("the Conquest's tree, ranking, members and results", () => {
  it("draws five branches, and buys a level an Officer can afford", async () => {
    const onResearch = vi.fn();
    render(wrap(<ConquestTree levels={{ roads: 0, cities: 4, forests: 10, wonders: 0, devotion: 9 }} knowledge={300} leads open onResearch={onResearch} />));
    const tree = screen.getByRole("list", { name: "Knowledge tree" });
    expect(tree.children).toHaveLength(5);
    expect(tree.querySelector("[data-branch=cities]")).toHaveTextContent("Cities · 4/10+20% on the cities you win");
    expect(tree.querySelector("[data-branch=cities]")).toHaveTextContent("Next: +30% on the cities you win");
    expect(tree.querySelector("[data-branch=forests]")).toHaveTextContent("Complete");
    expect(tree.querySelector("[data-branch=devotion]")).toHaveTextContent("22 Offerings a day");
    // 1,400 for Devotion's last level: out of reach with 300.
    expect(screen.getByRole("button", { name: "Buy Devotion level 10 for 1,400 Knowledge" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Buy Cities level 5 for 250 Knowledge" }));
    expect(onResearch).toHaveBeenCalledWith("cities");
  });

  it("shows a member the tree without its buttons, and closes it past Frontiers", () => {
    const { unmount } = render(wrap(<ConquestTree {...CONQUEST_PARTS.treeMember} />));
    expect(screen.queryByRole("button")).toBeNull();
    unmount();
    render(wrap(<ConquestTree levels={{ roads: 0, cities: 0, forests: 0, wonders: 0, devotion: 0 }} knowledge={9_999} leads open={false} />));
    expect(screen.getAllByRole("button").every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("shows the tree's view with the Knowledge to spend", () => {
    render(wrap(<ConquestScene {...CONQUEST.tree} />));
    expect(screen.getByRole("group", { name: "Knowledge" })).toHaveTextContent("Knowledge to spend");
    expect(screen.getByText(/You buy the levels, in order/)).toBeInTheDocument();
  });

  it("ranks the allegiances by points, the viewer's own marked", () => {
    render(wrap(<ConquestScene {...CONQUEST.ranking} />));
    const list = screen.getByRole("list", { name: "Allegiances by points" });
    expect(list.children).toHaveLength(6);
    expect(list.querySelectorAll("[data-mine]")).toHaveLength(1);
    expect(list.querySelector("[data-mine]")).toHaveTextContent("The Quarrymen");
  });

  it("lists the allegiance's members by tiles given, and opens one", async () => {
    const onOpenPlayer = vi.fn();
    render(wrap(<ConquestScene {...CONQUEST.members} onOpenPlayer={onOpenPlayer} />));
    const list = screen.getByRole("list", { name: "Members by tiles given" });
    expect(list.children).toHaveLength(CONQUEST.members.members.length);
    expect(list.querySelector("[data-me]")).toHaveTextContent("you · ");
    await userEvent.click(within(list).getAllByRole("button")[0]!);
    expect(onOpenPlayer).toHaveBeenCalledWith(CONQUEST.members.members[0]!.profile.address);
  });

  it("says what a phase and the final rank pay, and why a member short of days is not paid", () => {
    const { unmount } = render(wrap(<ConquestPhaseCard result={{ ...CONQUEST_PARTS.phase, days: 1, eligible: false, cobbles: 0 }} />));
    expect(screen.getByRole("region", { name: "End of Foundation" })).toHaveTextContent("Offerings on 1 of the phase's days: 3 are needed to be paid.");
    unmount();
    const final = CONQUEST_PARTS.final;
    render(wrap(<ConquestFinalCard final={{ ...final, place: 2, crest: "silver", days: 4, eligible: false, cobbles: 0, toClaim: 0 }} title="The last Conquest" />));
    const card = screen.getByRole("region", { name: "The last Conquest" });
    expect(card).toHaveTextContent("The Silver crest, for the whole next season.");
    expect(card).toHaveTextContent("Offerings on 4 days: 9 are needed for the final rank's Cobbles.");
    expect(within(card).queryByRole("button", { name: /^Claim/ })).toBeNull();
  });
});
