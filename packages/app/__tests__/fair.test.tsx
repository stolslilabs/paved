import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { FAIR_OFFERS, fairIsMythic } from "@paved/game-core";
import { FairEnd } from "../src/components/containers/fair-end";
import { PlayModes } from "../src/components/containers/play-modes";
import { FairScene, deckByPlan, draftSteps } from "../src/components/scenes/fair-scene";
import { FAIR, FAIR_CARD, FAIR_END } from "../src/mocks/fair";

// The Fair's scenes (the weekly individual event) on their mocks: Play's card, the week's view in each state, the draft, the ranking,
// a try's end. The routes are `fair-route.test.tsx`'s, the mock's rules `fair-mock.test.ts`'s.

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

describe("Play's Fair card", () => {
  const card = (state: keyof typeof FAIR_CARD, onFair = vi.fn()) => {
    render(wrap(<PlayModes spawnPaused={false} {...FAIR_CARD[state]} onFair={onFair} />));
    return { button: screen.getByRole("button", { name: /^Fair/ }), onFair };
  };

  it("shows no card where the network has no Fair", () => {
    render(wrap(<PlayModes spawnPaused={false} />));
    expect(screen.queryByRole("button", { name: /^Fair/ })).toBeNull();
  });

  it("names the day, the stall and the tries left today, with the week's time left, and opens on a tap", async () => {
    const { button, onFair } = card("week");
    expect(screen.getByText("Limited · Day 4 of 7")).toBeInTheDocument();
    expect(button).toHaveTextContent("Roads on every stall · 2 tries left today");
    expect(screen.getByRole("timer", { name: "3d 9h left in the fair" })).toBeInTheDocument();
    await userEvent.click(button);
    expect(onFair).toHaveBeenCalledOnce();
  });

  it.each([
    ["lastTry", "1 try left today"],
    ["noTryLeft", "0 tries left today"],
    ["guest", "Roads on every stall"],
  ] as const)("%s: %s", (state, line) => {
    expect(card(state).button).toHaveTextContent(line);
  });

  it("shows the open draft's pick", () => {
    card("drafting");
    expect(screen.getByRole("button", { name: "Fair: resume your draft, pick 9" })).toHaveTextContent("Your draft · pick 9");
  });

  it("shows the open game's score", () => {
    card("playing");
    expect(screen.getByRole("button", { name: "Fair: resume your game, 3,193 points" })).toHaveTextContent("3,193");
  });
});

describe("the Fair's view", () => {
  it("shows a first visit the stall, three tries, the rules and the tiers, and starts try 1", async () => {
    const onPlay = vi.fn();
    render(wrap(<FairScene {...FAIR.first} onPlay={onPlay} />));
    expect(screen.getByText("Thursday · day 4 of 7")).toBeInTheDocument();
    expect(screen.getByText("Spring's stall: roads")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Your week" })).getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How it goes" })).toBeInTheDocument();
    const tiers = within(screen.getByRole("list", { name: "Reward tiers" })).getAllByRole("listitem");
    expect(tiers.map((t) => t.textContent)).toEqual(["Top 1%300", "Top 5%150", "Top 20%60", "Top 50%20", "Counted5"]);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("shows the week: the best, its place and tier, the tries left, and the ranking's way", async () => {
    const onRanking = vi.fn();
    render(wrap(<FairScene {...FAIR.week} onRanking={onRanking} />));
    const week = screen.getByRole("group", { name: "Your week" });
    expect(week).toHaveTextContent("2tries left today");
    expect(week).toHaveTextContent("4,932your best try");
    expect(week).toHaveTextContent("#172Top 5%");
    expect(screen.getByRole("timer")).toHaveTextContent("in 3d 9h");
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Ranking" }));
    expect(onRanking).toHaveBeenCalledOnce();
  });

  it.each([
    ["drafting", "Resume", /Your draft waits at pick 9/],
    ["playing", "Resume", /Your game is on, a deck of 19 tiles: 3,193 points so far/],
  ] as const)("%s: %s", (state, label, line) => {
    render(wrap(<FairScene {...FAIR[state]} />));
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.getAttribute("data-slot") === "fair-open" && line.test(el.textContent ?? ""))).toBeInTheDocument();
  });

  it("offers no try once today's are spent, says when a best does not count, and asks a guest to sign in", () => {
    const { unmount } = render(wrap(<FairScene {...FAIR.noTryLeft} />));
    expect(screen.getByText("No try left today")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    unmount();
    const under = render(wrap(<FairScene {...FAIR.underFloor} />));
    expect(screen.getByText(/A best try counts from/)).toHaveTextContent("1,000");
    under.unmount();
    render(wrap(<FairScene {...FAIR.guest} />));
    expect(screen.queryByRole("group", { name: "Your week" })).toBeNull();
    expect(screen.getByText("Sign in to play")).toBeInTheDocument();
  });

  it("shows last week's result on Monday: the tier, the place, the champion's deck, and claims the Cobbles once", async () => {
    const onClaim = vi.fn();
    const { unmount } = render(wrap(<FairScene {...FAIR.result} onClaim={onClaim} />));
    const result = screen.getByRole("region", { name: "Last week's Fair" });
    expect(within(result).getByRole("heading", { name: "Top 5%" })).toBeInTheDocument();
    expect(result).toHaveTextContent("#183of 5,236 players");
    expect(result).toHaveTextContent("6,688");
    expect(within(result).getByRole("list", { name: "The champion's deck" })).toBeInTheDocument();
    // The amount written beside a one-word button.
    expect(within(result).getByText((_, el) => el?.getAttribute("data-slot") === "fair-claim")).toHaveTextContent("+150 CobblesClaim");
    await userEvent.click(within(result).getByRole("button", { name: "Claim" }));
    expect(onClaim).toHaveBeenCalledWith(FAIR.result.state.result!.week);
    unmount();
    const claimed = render(wrap(<FairScene {...FAIR.claimed} />));
    expect(screen.getByText((_, el) => el?.getAttribute("data-slot") === "fair-claim")).toHaveTextContent(/\+150 Cobbles\s*Claimed/);
    expect(screen.queryByRole("button", { name: /^Claim/ })).toBeNull();
    claimed.unmount();
    render(wrap(<FairScene {...FAIR.notCounted} />));
    expect(screen.getByRole("heading", { name: "Not counted" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claim/ })).toBeNull();
  });

  it("waits while the week is read, and shows why it could not be", async () => {
    const { unmount } = render(wrap(<FairScene {...FAIR.loading} />));
    expect(screen.getByLabelText("Fair")).toHaveAttribute("aria-busy", "true");
    unmount();
    const onRetry = vi.fn();
    render(wrap(<FairScene {...FAIR.failed} onRetry={onRetry} />));
    expect(screen.getByText("The Fair could not be read.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("the Fair's draft", () => {
  it("shows its progress, the offer of three tiles and the deck so far, never the next offer, and takes a tile on a tap", async () => {
    const onPick = vi.fn();
    render(wrap(<FairScene {...FAIR.draft} onPick={onPick} />));
    expect(screen.getByText("Pick 9 of 20")).toBeInTheDocument();
    const offer = within(screen.getByRole("list", { name: "Offer 9" })).getAllByRole("button");
    expect(offer).toHaveLength(3);
    expect(offer[0]).toHaveAccessibleName(/from the spring stall/);
    expect(screen.queryByText(/^Next: offer/)).toBeNull();
    const steps = [...screen.getByRole("img", { name: /^Offer 9 of 20: 8 taken/ }).children].map((el) => el.getAttribute("data-step"));
    expect(steps).toEqual(draftSteps(FAIR.draft.draft));
    expect(steps).toHaveLength(20);
    expect(steps.indexOf("current")).toBe(8);
    expect(steps.slice(9).every((step) => step === "todo")).toBe(true);
    const deck = FAIR.draft.draft.deck;
    expect(screen.getByText(new RegExp(`^${deck.length} tiles · `))).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Your deck so far" })).getAllByRole("listitem")).toHaveLength(deckByPlan(deck).length);
    await userEvent.click(offer[1]!);
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("prices a mythic on the table: two picks, the next offer passes", () => {
    render(wrap(<FairScene {...FAIR.draftMythic} />));
    const { offer } = FAIR.draftMythic.draft;
    const mythic = offer.cards.findIndex(fairIsMythic);
    const tile = within(screen.getByRole("list", { name: `Offer ${offer.number}` })).getAllByRole("button")[mythic]!;
    expect(tile).toHaveAccessibleName(new RegExp(`mythic.*: offer ${offer.number + 1} passes$`));
    expect(tile).toHaveTextContent("2 picks");
    expect(screen.getByText("A mythic costs two picks: take it and the next offer passes.")).toBeInTheDocument();
  });

  it("shows no deck at the first offer, the mythics and the offers they passed on the last one's bar, and leaves the try", async () => {
    const onAbandon = vi.fn();
    const { unmount } = render(wrap(<FairScene {...FAIR.draftFirst} onAbandon={onAbandon} />));
    expect(screen.getByText(/No tile yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Leave this try" }));
    expect(onAbandon).toHaveBeenCalledOnce();
    unmount();
    const last = render(wrap(<FairScene {...FAIR.draftLast} />));
    expect(screen.getByText(`Pick ${FAIR_OFFERS} of ${FAIR_OFFERS}`)).toBeInTheDocument();
    const steps = draftSteps(FAIR.draftLast.draft);
    expect(steps.filter((step) => step === "passed")).toHaveLength(FAIR.draftLast.draft.passed.length);
    expect(steps.filter((step) => step === "mythic")).toHaveLength(FAIR.draftLast.draft.passed.length);
    expect(document.querySelectorAll('[data-slot="fair-progress"] [data-step="passed"]')).toHaveLength(FAIR.draftLast.draft.passed.length);
    expect(screen.getByText(/offers? passed/)).toBeInTheDocument();
    last.unmount();
    render(wrap(<FairScene {...FAIR.draftLoading} />));
    expect(screen.getByLabelText("Fair")).toHaveAttribute("aria-busy", "true");
  });
});

describe("the Fair's ranking", () => {
  it("lists the first three, then the places around the viewer, each with their portrait and deck", async () => {
    const onOpenPlayer = vi.fn();
    render(wrap(<FairScene {...FAIR.ranking} onOpenPlayer={onOpenPlayer} />));
    expect(screen.getByRole("timer")).toHaveTextContent("Live · 3d 9h left");
    const list = screen.getByRole("list", { name: "Fair ranking" });
    const rows = within(list).getAllByRole("button");
    // Three first places, the viewer's neighbours and the viewer; the places left out are dots.
    expect(rows.map((row) => row.getAttribute("aria-label")!.split(".")[0])).toEqual(["1", "2", "3", "171", "172", "173"]);
    expect(list.querySelectorAll('[data-slot="fair-gap"]')).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("18 tiles · 2 mythics");
    expect(rows[0]).toHaveTextContent("6,688");
    expect(rows[2]).toHaveTextContent("20 tiles · no mythic");
    expect(rows.every((row) => row.querySelector('[data-slot="ranking-rim"]'))).toBe(true);
    expect(rows[4]).toHaveAttribute("data-own", "true");
    expect(rows[4]).toHaveTextContent("19 tiles · 1 mythicYou");
    await userEvent.click(rows[0]!);
    expect(onOpenPlayer).toHaveBeenCalledWith(FAIR.ranking.ranking.entries[0]!.profile.address);
  });

  it("shows the whole list to a viewer within the first places, their row lit, no dots", () => {
    render(wrap(<FairScene {...FAIR.rankingTop} />));
    const list = screen.getByRole("list", { name: "Fair ranking" });
    const rows = within(list).getAllByRole("button");
    expect(rows).toHaveLength(FAIR.rankingTop.ranking.entries.length);
    expect(list.querySelector('[data-slot="fair-gap"]')).toBeNull();
    expect(rows[4]).toHaveAttribute("data-own", "true");
  });

  it("draws each tier's bar so far, the viewer's own marked", () => {
    render(wrap(<FairScene {...FAIR.ranking} />));
    expect(screen.getByRole("heading", { name: "The tiers so far" })).toBeInTheDocument();
    const tiers = within(screen.getByRole("list", { name: "Reward tiers" })).getAllByRole("listitem");
    expect(tiers[0]).toHaveTextContent("Top 1%from 5,900300");
    expect(tiers[1]).toHaveTextContent("Top 5%from 4,700 · you150");
    expect(tiers[1]).toHaveAttribute("data-own", "true");
    expect(screen.getByText(/players have a best try of/)).toHaveTextContent("4,812 players have a best try of 1,000 or more.");
  });

  it("has its tabs as a bottom navigation: this week, friends, my tries", async () => {
    const onRankingTab = vi.fn();
    render(wrap(<FairScene {...FAIR.ranking} onRankingTab={onRankingTab} />));
    const tabs = within(screen.getByRole("tablist", { name: "Fair ranking" })).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["This week", "Friends", "My tries"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.click(tabs[1]!);
    expect(onRankingTab).toHaveBeenCalledWith("friends");
  });

  it("ranks the viewer among their friends, and says when none has a counted try", () => {
    const { unmount } = render(wrap(<FairScene {...FAIR.rankingFriends} />));
    const rows = within(screen.getByRole("list", { name: "Friends' ranking" })).getAllByRole("button");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveAttribute("data-own", "true");
    expect(screen.queryByRole("list", { name: "Fair ranking" })).toBeNull();
    unmount();
    render(wrap(<FairScene {...FAIR.rankingNoFriend} />));
    expect(screen.getByText(/No friend has a counted try yet/)).toBeInTheDocument();
  });

  it("lists the viewer's own tries, the newest first, the best tagged, and opens one", async () => {
    const onOpenTry = vi.fn();
    const { unmount } = render(wrap(<FairScene {...FAIR.rankingTries} onOpenTry={onOpenTry} />));
    const rows = within(screen.getByRole("list", { name: "Your tries" })).getAllByRole("button");
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Thursday, try 2: Draft in progress",
      "Thursday, try 1: 4,932 points, 19 tiles · 1 mythic, your best",
      "Wednesday, try 1: Left during its draft",
      "Tuesday, try 1: 3,640 points, 20 tiles · no mythic",
    ]);
    expect(rows[1]).toHaveTextContent("Best");
    expect(rows[2]).toBeDisabled();
    await userEvent.click(rows[1]!);
    expect(onOpenTry).toHaveBeenCalledWith(5);
    unmount();
    render(wrap(<FairScene {...FAIR.rankingNoTry} />));
    expect(screen.getByText("No try yet this week.")).toBeInTheDocument();
  });

  it("says when no try counts yet, and waits while it is read", () => {
    const { unmount } = render(wrap(<FairScene {...FAIR.rankingEmpty} />));
    expect(screen.getByText("No try counts yet this week.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Reward tiers" })).getAllByText("nobody yet")).toHaveLength(5);
    unmount();
    const { container } = render(wrap(<FairScene {...FAIR.rankingLoading} />));
    expect(container.querySelector("[aria-busy]")).not.toBeNull();
  });
});

describe("a Fair try's end", () => {
  const end = (state: keyof typeof FAIR_END, props: { onFair?: () => void; onPlayAgain?: () => void } = {}) => render(wrap(<FairEnd {...FAIR_END[state]} instant {...props} />));

  it("crowns a new best with its place and tier, and offers the next try while one is left today", async () => {
    const onPlayAgain = vi.fn();
    end("newBest", { onPlayAgain });
    expect(screen.getByText("NEW BEST")).toBeInTheDocument();
    expect(screen.getByText("Fair · try 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Score" })).toHaveTextContent("4,9323,640 → 4,932");
    expect(screen.getByRole("region", { name: "Week's place" })).toHaveTextContent("#172Top 5% · of 3,410");
    expect(screen.getByText((_, el) => el?.getAttribute("data-slot") === "fair-tries-left")).toHaveTextContent("1 try left today");
    await userEvent.click(screen.getByRole("button", { name: "Again" }));
    expect(onPlayAgain).toHaveBeenCalledOnce();
  });

  it.each([
    ["first", "NEW BEST", "Your first of this week"],
    ["below", "GAME OVER", "Best 3,640"],
    ["late", "GAME OVER", "Too late to count"],
  ] as const)("%s: %s, %s", (state, verdict, line) => {
    end(state);
    expect(screen.getByText(verdict)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Score" })).toHaveTextContent(line);
  });

  it("says a best under the floor does not count yet, and goes back to the Fair after the day's last try", async () => {
    const { unmount } = end("underFloor");
    expect(screen.getByRole("region", { name: "Week's place" })).toHaveTextContent("—Counts from 1,000");
    unmount();
    const onFair = vi.fn();
    end("last", { onFair });
    expect(screen.queryByRole("button", { name: "Again" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "The Fair" }));
    expect(onFair).toHaveBeenCalledOnce();
  });

  it("waits for the result", () => {
    end("reading");
    expect(screen.getByRole("region", { name: "Week's place" })).toHaveTextContent("—…");
  });
});
