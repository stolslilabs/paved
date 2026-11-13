import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { MasterpieceStrip } from "../src/components/containers/masterpiece-strip";
import { PlayModes } from "../src/components/containers/play-modes";
import { placeName, topShare } from "../src/components/elements/masterpiece-kind";
import { MasterpieceScene } from "../src/components/scenes/masterpiece-scene";
import { MASTERPIECE, MASTERPIECE_CARD, MASTERPIECE_STRIP } from "../src/mocks/masterpiece";

// The Masterpiece's scenes (the weekly individual event) on their mocks: Play's card, the week's view in each state, the ranking's
// view, the board's strip. The routes are `masterpiece-route.test.tsx`'s, the mock's rules `masterpiece-mock.test.ts`'s.

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

describe("Play's Masterpiece card", () => {
  it("shows no card where the network has no Masterpiece", () => {
    render(wrap(<PlayModes spawnPaused={false} />));
    expect(screen.queryByRole("button", { name: /^Masterpiece/ })).toBeNull();
  });

  it("names the day, the kind and the week's time left, and opens the view", async () => {
    const onMasterpiece = vi.fn();
    render(wrap(<PlayModes spawnPaused={false} {...MASTERPIECE_CARD.firstVisit} onMasterpiece={onMasterpiece} />));
    const card = document.querySelector("[data-slot=masterpiece-card]") as HTMLElement;
    expect(card).toHaveTextContent("Limited · Day 3 of 7");
    expect(card).toHaveTextContent("One city counts · open your board");
    expect(screen.getByRole("timer", { name: "4d 4h left in the masterpiece's week" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Masterpiece" }));
    expect(onMasterpiece).toHaveBeenCalledOnce();
  });

  it("counts the tiles waiting beside the piece, then shows the piece and its score", () => {
    const first = render(wrap(<PlayModes spawnPaused={false} {...MASTERPIECE_CARD.nothingClosed} />));
    expect(screen.getByRole("button", { name: "Masterpiece" })).toHaveTextContent("8 tiles waiting · no city closed yet");
    first.unmount();
    const second = render(wrap(<PlayModes spawnPaused={false} {...MASTERPIECE_CARD.waiting} />));
    expect(screen.getByRole("button", { name: "Masterpiece: 3,823 points" })).toHaveTextContent("5 tiles waiting · city of 14");
    second.unmount();
    render(wrap(<PlayModes spawnPaused={false} {...MASTERPIECE_CARD.played} />));
    expect(screen.getByRole("button", { name: "Masterpiece: 12,621 points" })).toHaveTextContent("crowned wonder of 31 · 12,621");
  });
});

describe("the Masterpiece's view", () => {
  it("explains the week before the first visit, lists the tiers, and opens the board", async () => {
    const onOpen = vi.fn();
    render(wrap(<MasterpieceScene {...MASTERPIECE.firstVisit} onOpen={onOpen} />));
    expect(screen.getByText("Winter · Day 3 of 7")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The city" })).toBeInTheDocument();
    expect(screen.getByText("A closed city: walls all round.")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("Ends Sunday at 24:00 UTC · in 4d 4h");
    expect(within(screen.getByRole("list", { name: "How it goes" })).getAllByRole("listitem")).toHaveLength(4);
    expect(within(screen.getByRole("list", { name: "Tiers" })).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Top 1% 300", "Top 5% 150", "Top 20% 60", "Top 50% 20", "A counted masterpiece below 5"]);
    await userEvent.click(screen.getByRole("button", { name: "Open your board" }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.queryByRole("region", { name: "Last week's masterpiece" })).toBeNull();
  });

  it("shows the board on Wednesday: the piece less its discard, its live place, what is growing, the days", async () => {
    const onRanking = vi.fn();
    render(wrap(<MasterpieceScene {...MASTERPIECE.board} onRanking={onRanking} />));
    expect(screen.getByRole("group", { name: "Your masterpiece" })).toHaveTextContent("3,823points14tiles5waiting48to come");
    const piece = document.querySelector("[data-slot=masterpiece-piece]")!;
    expect(piece).toHaveTextContent("City of 14, 3,873 points, less 50 for a discard. Live: 1,402nd of 3,120, top 45%.");
    expect(document.querySelector("[data-slot=masterpiece-prospect]")).toHaveTextContent("Growing: an open city of 22, 4 edges open, worth 7,327 if closed now.");
    const days = within(screen.getByRole("list", { name: "The week's days" })).getAllByRole("listitem");
    expect(days.map((d) => d.textContent)).toEqual(["Mon12done", "Tue12done", "Wed7played", "Thu·", "Fri·", "Sat·", "Sun·"]);
    expect(days[2]).toHaveAttribute("data-today", "true");
    expect(within(screen.getByRole("list", { name: "Tiers" })).getAllByRole("listitem")[3]).toHaveAttribute("data-reached", "true");
    expect(screen.getByRole("button", { name: "Play 5 tiles" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ranking" }));
    expect(onRanking).toHaveBeenCalledOnce();
  });

  it("says when nothing is closed, when the piece is under the floor, and when the day's tiles are played", () => {
    const first = render(wrap(<MasterpieceScene {...MASTERPIECE.nothingClosed} />));
    expect(document.querySelector("[data-slot=masterpiece-piece]")).toHaveTextContent("No city closed yet: only a closed one scores.");
    first.unmount();
    const second = render(wrap(<MasterpieceScene {...MASTERPIECE.notCounted} />));
    expect(document.querySelector("[data-slot=masterpiece-piece]")).toHaveTextContent("City of 5, 1,123 points. Not counted yet: a masterpiece counts from 8.");
    second.unmount();
    render(wrap(<MasterpieceScene {...MASTERPIECE.saturday} />));
    expect(document.querySelector("[data-slot=masterpiece-piece]")).toHaveTextContent("City of 31, 12,721 points, less 100 for 2 discards. Live: 188th of 4,690, top 5%.");
    expect(document.querySelector("[data-slot=masterpiece-prospect]")).toBeNull();
    expect(screen.getByRole("button", { name: "See your board" })).toBeInTheDocument();
  });

  it("names the crowned wonder on a summer week", () => {
    render(wrap(<MasterpieceScene {...MASTERPIECE.wonder} />));
    expect(screen.getByRole("heading", { name: "The crowned wonder" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot=masterpiece-piece]")).toHaveTextContent("Crowned wonder of 15, 2,279 points");
  });

  it("shows last week's result with its tier, its place and the week's master, and claims its Cobbles", async () => {
    const onClaim = vi.fn();
    render(wrap(<MasterpieceScene {...MASTERPIECE.result} onClaim={onClaim} />));
    const result = screen.getByRole("region", { name: "Last week's masterpiece" });
    expect(result).toHaveTextContent("Last week · the city");
    expect(result).toHaveTextContent("Top 5%");
    expect(result).toHaveTextContent("Your masterpiece: City of 31, 212th of 5,840.");
    expect(result).toHaveTextContent("The week's master: Mira, city of 46 · 26,726");
    await userEvent.click(within(result).getByRole("button", { name: "Claim +150 Cobbles" }));
    expect(onClaim).toHaveBeenCalledWith(MASTERPIECE.result.state.result!.week);
  });

  it("shows a claimed result, the viewer as the week's master, and a result that was not counted", () => {
    const first = render(wrap(<MasterpieceScene {...MASTERPIECE.resultClaimed} />));
    expect(screen.getByRole("region", { name: "Last week's masterpiece" })).toHaveTextContent("150 Cobbles claimed");
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
    first.unmount();
    const second = render(wrap(<MasterpieceScene {...MASTERPIECE.resultMaster} />));
    expect(screen.getByRole("region", { name: "Last week's masterpiece" })).toHaveTextContent("The week's master: you, city of 47 · 27,950");
    expect(screen.getByRole("button", { name: "Claim +300 Cobbles" })).toBeInTheDocument();
    second.unmount();
    const third = render(wrap(<MasterpieceScene {...MASTERPIECE.resultNotCounted} />));
    expect(screen.getByRole("region", { name: "Last week's masterpiece" })).toHaveTextContent("Not counted");
    expect(screen.getByRole("region", { name: "Last week's masterpiece" })).toHaveTextContent("Only a masterpiece of 8 or more is counted.");
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
    third.unmount();
    render(wrap(<MasterpieceScene {...MASTERPIECE.resultNothing} />));
    expect(screen.getByRole("region", { name: "Last week's masterpiece" })).toHaveTextContent("You closed no city: nothing to count.");
  });

  it("waits while the week is read, and shows a failed read with Retry", async () => {
    const first = render(wrap(<MasterpieceScene {...MASTERPIECE.loading} />));
    expect(screen.getByLabelText("Masterpiece")).toHaveAttribute("aria-busy", "true");
    first.unmount();
    const onRetry = vi.fn();
    render(wrap(<MasterpieceScene {...MASTERPIECE.failed} onRetry={onRetry} />));
    expect(screen.getByText("The week could not be read.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("the Masterpiece's ranking", () => {
  it("lists the first ten, the viewer's line, the bars so far and the Hall's records", () => {
    render(wrap(<MasterpieceScene {...MASTERPIECE.ranking} />));
    const top = within(screen.getByRole("list", { name: "The first places" })).getAllByRole("listitem");
    expect(top).toHaveLength(10);
    expect(top[0]).toHaveTextContent("1MiraCity of 4626,726");
    // A name is never cut without its whole text at hand (WRAP360).
    expect(within(top[2]!).getByTitle("WWWWWWWWWWWWWWWWWW88")).toBeInTheDocument();
    const mine = within(screen.getByRole("list", { name: "Your place" })).getByRole("listitem");
    expect(mine).toHaveTextContent("188Stonewright (you)City of 3112,621");
    expect(mine).toHaveAttribute("data-me", "true");
    expect(within(screen.getByRole("list", { name: "Tiers" })).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Top 1%from 20,100 300", "Top 5%from 11,900 150", "Top 20%from 7,000 60", "Top 50%from 3,700 20", "A counted masterpiece below 5"]);
    expect(document.querySelector("[data-slot=masterpiece-share]")).toHaveTextContent("You stand in the top 4%.");
    const hall = within(screen.getByRole("list", { name: "Records by kind" })).getAllByRole("listitem");
    expect(hall.map((r) => r.textContent)).toEqual(["Winter · City of 46Mira26,726", "Spring · Road of 39WWWWWWWWWWWWWWWWWW889,640", "Summer · Crowned wonder of 33You9,480", "Autumn · Forest of 28GustyPike6911,500"]);
  });

  it("lights the viewer's line among the first ten, and says when nothing is counted yet", () => {
    const first = render(wrap(<MasterpieceScene {...MASTERPIECE.rankingTop} />));
    expect(within(screen.getByRole("list", { name: "The first places" })).getAllByRole("listitem")[2]).toHaveAttribute("data-me", "true");
    expect(screen.queryByRole("list", { name: "Your place" })).toBeNull();
    first.unmount();
    const second = render(wrap(<MasterpieceScene {...MASTERPIECE.rankingEmpty} />));
    expect(screen.getByText("No masterpiece is counted yet this week.")).toBeInTheDocument();
    expect(screen.getByText("No record yet.")).toBeInTheDocument();
    second.unmount();
    render(wrap(<MasterpieceScene {...MASTERPIECE.rankingLoading} />));
    expect(screen.getByLabelText("Ranking")).toHaveAttribute("aria-busy", "true");
  });

  it("names places and shares", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 112, 1_402].map(placeName)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "112th", "1,402nd"]);
    expect([topShare(1, 5_840), topShare(212, 5_840), topShare(5_840, 5_840), topShare(1, 0)]).toEqual(["Top 1%", "Top 4%", "Top 100%", "Top 100%"]);
  });
});

describe("the Masterpiece board's strip", () => {
  it("shows the piece so far, what is growing and the tiles waiting", () => {
    const first = render(wrap(<MasterpieceStrip {...MASTERPIECE_STRIP.growing} />));
    expect(screen.getByRole("heading", { name: "City of 14 · 3,873" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot=masterpiece-strip]")).toHaveTextContent("Open city of 22, 4 edges open: 7,327 if closed now5 waiting48 to come");
    first.unmount();
    const second = render(wrap(<MasterpieceStrip {...MASTERPIECE_STRIP.nothingClosed} />));
    expect(screen.getByRole("heading", { name: "No city closed yet" })).toBeInTheDocument();
    second.unmount();
    render(wrap(<MasterpieceStrip {...MASTERPIECE_STRIP.closed} />));
    expect(document.querySelector("[data-slot=masterpiece-strip]")).toHaveTextContent("No open city: only a closed one scores0 waiting12 to come");
  });
});
