import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ExpeditionHand } from "../src/components/containers/expedition-hand";
import { PlayModes } from "../src/components/containers/play-modes";
import { ExpeditionScene } from "../src/components/scenes/expedition-scene";
import { EXPEDITION, EXPEDITION_CARD, EXPEDITION_HAND } from "../src/mocks/expedition";

// The Expedition's scenes (the weekly individual event) on their mocks: Play's card, the week's view in each state, the board's strip.
// The routes are `expedition-route.test.tsx`'s, the mock's rules `expedition-mock.test.ts`'s.

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

describe("Play's Expedition card", () => {
  it("shows no card where the network has no Expedition", () => {
    render(wrap(<PlayModes spawnPaused={false} />));
    expect(screen.queryByRole("button", { name: /^Expedition/ })).toBeNull();
  });

  it("names the day, the map and the week's time left, and opens the view", async () => {
    const onExpedition = vi.fn();
    render(wrap(<PlayModes spawnPaused={false} {...EXPEDITION_CARD.firstVisit} onExpedition={onExpedition} />));
    const card = document.querySelector("[data-slot=expedition-card]") as HTMLElement;
    expect(card).toHaveTextContent("Limited · Day 3 of 7");
    expect(card).toHaveTextContent("The Sacred Wood · open the map");
    expect(screen.getByRole("timer", { name: "4d 18h left in the expedition" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Expedition" }));
    expect(onExpedition).toHaveBeenCalledOnce();
  });

  it("counts the tiles a new day brings, then the hand and the score", () => {
    const { unmount } = render(wrap(<PlayModes spawnPaused={false} {...EXPEDITION_CARD.newDay} />));
    expect(screen.getByRole("button", { name: "Expedition: 1,500 points" })).toHaveTextContent("6 new tiles, 1 kept");
    unmount();
    render(wrap(<PlayModes spawnPaused={false} {...EXPEDITION_CARD.playing} />));
    expect(screen.getByRole("button", { name: "Expedition: 3,223 points" })).toHaveTextContent("3 in hand · 3,223");
  });
});

describe("the Expedition's view", () => {
  it("shows the week's map before the first visit: its four landmarks, how it goes, the tiers, and opens it", async () => {
    const onOpen = vi.fn();
    render(wrap(<ExpeditionScene {...EXPEDITION.firstVisit} onOpen={onOpen} />));
    expect(screen.getByText("Autumn · Day 3 of 7")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The Sacred Wood" })).toBeInTheDocument();
    const landmarks = within(screen.getByRole("list", { name: "Landmarks" })).getAllByRole("listitem");
    expect(landmarks.map((l) => l.textContent)).toEqual([
      expect.stringContaining("Reach the old crossroads+300"),
      expect.stringContaining("Surround the ruin+600"),
      expect.stringContaining("Link the two villages+900"),
      expect.stringContaining("+1,500"),
    ]);
    expect(within(screen.getByRole("list", { name: "Tiers" })).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Scout4,000 20", "Pathfinder6,000 40", "Explorer8,000 70", "Cartographer10,000 100"]);
    await userEvent.click(screen.getByRole("button", { name: "Open the map" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("shows the board on Wednesday: the score, the hand, the bag, the next tier, the landmarks and the journal", () => {
    render(wrap(<ExpeditionScene {...EXPEDITION.board} />));
    const board = screen.getByRole("group", { name: "Your board" });
    expect(board).toHaveTextContent("3,223points");
    expect(board).toHaveTextContent("3in hand");
    expect(board).toHaveTextContent("24to come");
    expect(document.querySelector("[data-slot=expedition-tier]")).toHaveTextContent("777 to go to Scout.");
    const landmarks = within(screen.getByRole("list", { name: "Landmarks" })).getAllByRole("listitem");
    expect(landmarks.filter((l) => l.dataset.done).map((l) => l.textContent)).toEqual([expect.stringContaining("Link the two villages")]);
    expect(landmarks[1]).toHaveTextContent("3 of 8 cells laid");
    const days = within(screen.getByRole("list", { name: "The week's days" })).getAllByRole("listitem");
    expect(days.map((d) => d.textContent)).toEqual(["Mon6laid", "Tue5laid", "Wed4laid", "Thu·", "Fri·", "Sat·", "Sun·"]);
    expect(days[2]!.dataset.today).toBe("true");
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("offers the day's draw, and says what a long absence loses", () => {
    const { unmount } = render(wrap(<ExpeditionScene {...EXPEDITION.newDay} />));
    expect(screen.getByRole("button", { name: "Draw 6 tiles" })).toBeInTheDocument();
    unmount();
    render(wrap(<ExpeditionScene {...EXPEDITION.missedDays} />));
    expect(screen.getByRole("button", { name: "Draw 10 tiles" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "The week's days" })).getAllByRole("listitem")[4]).toHaveTextContent("−2");
  });

  it("marks the tiers reached, up to the last", () => {
    render(wrap(<ExpeditionScene {...EXPEDITION.cartographer} />));
    expect(document.querySelector("[data-slot=expedition-tier]")).toHaveTextContent("Cartographer reached. The highest tier.");
    expect(within(screen.getByRole("list", { name: "Tiers" })).getAllByRole("listitem").every((l) => l.dataset.reached)).toBe(true);
  });

  it("shows last week's tier with what everyone else reached, and claims its Cobbles", async () => {
    const onClaim = vi.fn();
    const { unmount } = render(wrap(<ExpeditionScene {...EXPEDITION.result} onClaim={onClaim} />));
    const result = screen.getByRole("region", { name: "Last week's expedition" });
    expect(result).toHaveTextContent("Explorer");
    expect(result).toHaveTextContent("8,412");
    expect(result).toHaveTextContent("The board 6,612 · the landmarks 1,800");
    expect(within(result).getAllByRole("listitem").map((l) => l.textContent)).toEqual([
      expect.stringContaining("78%"),
      expect.stringContaining("41%"),
      expect.stringContaining("27%"),
      expect.stringContaining("9%"),
    ]);
    expect(result).toHaveTextContent("3,912 explorers");
    await userEvent.click(within(result).getByRole("button", { name: "Claim +70 Cobbles" }));
    expect(onClaim).toHaveBeenCalledWith(EXPEDITION.result.state.result.week);
    unmount();
    render(wrap(<ExpeditionScene {...EXPEDITION.resultClaimed} />));
    expect(screen.getByText("70 Cobbles claimed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
  });

  it("holds the claim under level 3, and offers none without a tier", () => {
    const { unmount } = render(wrap(<ExpeditionScene {...EXPEDITION.resultLocked} />));
    expect(document.querySelector("[data-slot=expedition-locked]")).toHaveTextContent("Reach level 3 to claim your 70 Cobbles. You are level 1.");
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
    unmount();
    render(wrap(<ExpeditionScene {...EXPEDITION.resultNoTier} />));
    expect(screen.getByRole("region", { name: "Last week's expedition" })).toHaveTextContent("No tier reached");
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
  });

  it("waits while the week is read, and says why it could not be", async () => {
    const onRetry = vi.fn();
    const { unmount } = render(wrap(<ExpeditionScene {...EXPEDITION.loading} />));
    expect(screen.getByLabelText("Expedition")).toHaveAttribute("aria-busy", "true");
    unmount();
    render(wrap(<ExpeditionScene {...EXPEDITION.failed} onRetry={onRetry} />));
    expect(screen.getByText("The week could not be read.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("the board's strip", () => {
  it("shows the whole hand, the tile picked, and picks another", async () => {
    const onSelect = vi.fn();
    render(wrap(<ExpeditionHand {...EXPEDITION_HAND.five} onSelect={onSelect} />));
    const tiles = within(screen.getByRole("list", { name: "Hand" })).getAllByRole("button");
    expect(tiles).toHaveLength(5);
    expect(tiles.map((t) => t.getAttribute("aria-pressed"))).toEqual(["false", "true", "false", "false", "false"]);
    await userEvent.click(tiles[3]!);
    expect(onSelect).toHaveBeenCalledWith(3);
    expect(screen.getByRole("list", { name: "Landmarks" })).toHaveTextContent("Ruin3/8+600");
    expect(document.querySelector("[data-slot=expedition-hand]")).toHaveTextContent("5 in hand24 to come");
  });

  it("says when the hand is empty, and takes no pick on a board that takes no move", async () => {
    const { unmount } = render(wrap(<ExpeditionHand {...EXPEDITION_HAND.empty} />));
    expect(screen.getByText("The hand is empty: the next tiles come tomorrow.")).toBeInTheDocument();
    unmount();
    render(wrap(<ExpeditionHand {...EXPEDITION_HAND.bagDrawn} />)).unmount();
    render(wrap(<ExpeditionHand {...EXPEDITION_HAND.readOnly} />));
    expect(within(screen.getByRole("list", { name: "Hand" })).getAllByRole("button").every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});
