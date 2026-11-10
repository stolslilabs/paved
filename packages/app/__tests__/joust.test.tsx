import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { JoustEnd } from "../src/components/containers/joust-end";
import { PlayModes } from "../src/components/containers/play-modes";
import { JoustScene, joustLift } from "../src/components/scenes/joust-scene";
import { JOUST, JOUST_CARD, JOUST_END } from "../src/mocks/joust";

// The Joust's scenes (the weekly allegiance event) on their mocks: Play's card, the week's view in each state, both top 10, the
// ranking, a game's end. The routes are `joust-route.test.tsx`'s, the mock's rules `joust-mock.test.ts`'s.

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

describe("Play's Joust card", () => {
  const card = (state: keyof typeof JOUST_CARD, onJoust = vi.fn()) => {
    render(wrap(<PlayModes spawnPaused={false} {...JOUST_CARD[state]} onJoust={onJoust} />));
    return { button: screen.getByRole("button", { name: /^Joust/ }), onJoust };
  };

  it("shows no card where the network has no Joust", () => {
    render(wrap(<PlayModes spawnPaused={false} />));
    expect(screen.queryByRole("button", { name: /^Joust/ })).toBeNull();
  });

  it("says the registration is open, then done, with the time until the draw", () => {
    const { button } = card("open");
    expect(button).toHaveTextContent("Registration is open");
    expect(screen.getByRole("timer", { name: "2d 6h until the draw" })).toBeInTheDocument();
  });

  it("names the opponent and both totals while the match is live, and opens on a tap", async () => {
    const { button, onJoust } = card("live");
    expect(button).toHaveTextContent("vs Ironvale · 18,290 to 17,940");
    expect(screen.getByRole("timer", { name: "1d 6h left in the joust" })).toBeInTheDocument();
    await userEvent.click(button);
    expect(onJoust).toHaveBeenCalledOnce();
  });

  it.each([
    ["registered", "Registered · the draw on Friday"],
    ["bye", "A bye this week"],
    ["satOut", "Your allegiance sits this one out"],
    ["guildless", "Join an allegiance to joust"],
  ] as const)("%s: %s", (state, line) => {
    expect(card(state).button).toHaveTextContent(line);
  });

  it("shows the open game's score", () => {
    card("playing");
    expect(screen.getByRole("button", { name: "Joust: resume your game, 1,640 points" })).toHaveTextContent("1,640");
  });
});

describe("the Joust's view", () => {
  it("lets an Officer register during the registration, and tells a member who does", async () => {
    const onRegister = vi.fn();
    const { unmount } = render(wrap(<JoustScene {...JOUST.officer} onRegister={onRegister} />));
    expect(screen.getByText("Registration · Mon to Thu")).toBeInTheDocument();
    expect(screen.getByText("A roads joust: roads score ×2")).toBeInTheDocument();
    expect(within(document.querySelector("[data-slot=joust-guild]") as HTMLElement).getByText("1,100")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Register The Quarrymen" }));
    expect(onRegister).toHaveBeenCalledOnce();
    unmount();
    render(wrap(<JoustScene {...JOUST.member} />));
    expect(screen.queryByRole("button", { name: /Register/ })).toBeNull();
    expect(screen.getByText(/an Officer or the Leader registers The Quarrymen/)).toBeInTheDocument();
  });

  it("says a registered allegiance waits for Friday's draw", () => {
    render(wrap(<JoustScene {...JOUST.registered} />));
    expect(screen.getByText(/The Quarrymen is registered/)).toBeInTheDocument();
  });

  it("sends a player without an allegiance to find one", async () => {
    const onAllegiance = vi.fn();
    render(wrap(<JoustScene {...JOUST.guildless} onAllegiance={onAllegiance} />));
    await userEvent.click(screen.getByRole("button", { name: "Find an allegiance" }));
    expect(onAllegiance).toHaveBeenCalledOnce();
  });

  it("shows the live match, the viewer's games and what a better game would change", async () => {
    const onPlay = vi.fn();
    const onTop = vi.fn();
    render(wrap(<JoustScene {...JOUST.live} onPlay={onPlay} onTop={onTop} />));
    const match = document.querySelector("[data-slot=joust-match]") as HTMLElement;
    expect(match).toHaveTextContent("18,290");
    expect(match).toHaveTextContent("17,940");
    expect(match).toHaveTextContent("23 jousters · 31 games left");
    expect(match).toHaveTextContent("48 % · 52 %");
    const games = screen.getByRole("group", { name: "Your games" });
    expect(games).toHaveTextContent("1played");
    expect(games).toHaveTextContent("2left");
    expect(games).toHaveTextContent("1,880your best · #4");
    // Past the third's 1,960: 1,970, eighty more than their 1,880.
    expect(document.querySelector("[data-slot=joust-lift]")).toHaveTextContent("A best of 1,970 would lift The Quarrymen to 18,380.");
    await userEvent.click(screen.getByRole("button", { name: "Play game 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Both top 10" }));
    expect(onPlay).toHaveBeenCalledOnce();
    expect(onTop).toHaveBeenCalledOnce();
  });

  it.each([
    ["playing", "Resume"],
  ] as const)("%s: the footer's %s", (state, name) => {
    render(wrap(<JoustScene {...JOUST[state]} />));
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });

  it("offers no game to a jouster with none left, to a newcomer, or to an allegiance sitting out", () => {
    for (const [state, text] of [
      ["noGameLeft", "No game left"],
      ["newcomer", "You joined after Friday 00:00 UTC: you joust from the next one."],
      ["satOut", /sits this joust out/],
    ] as const) {
      const { unmount } = render(wrap(<JoustScene {...JOUST[state]} />));
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Play game|Resume/ })).toBeNull();
      unmount();
    }
  });

  it("explains a bye", () => {
    render(wrap(<JoustScene {...JOUST.bye} />));
    expect(screen.getByText(/A bye this week/)).toBeInTheDocument();
  });

  it("shows last week's victory, its rating's move and Claim; a claimed defeat has none", async () => {
    const onClaim = vi.fn();
    const { unmount } = render(wrap(<JoustScene {...JOUST.result} onClaim={onClaim} />));
    const result = screen.getByRole("region", { name: "Last week's joust" });
    expect(within(result).getByRole("heading", { name: "Victory!" })).toBeInTheDocument();
    expect(result).toHaveTextContent("18,420");
    expect(result).toHaveTextContent("1,184 → 1,201");
    expect(result).toHaveTextContent("+17");
    expect(result).toHaveTextContent("Mirachampion · 2,140");
    await userEvent.click(within(result).getByRole("button", { name: "Claim +50 Cobbles" }));
    expect(onClaim).toHaveBeenCalledWith(JOUST.result.state.result!.week);
    unmount();
    render(wrap(<JoustScene {...JOUST.defeat} />));
    expect(screen.getByRole("heading", { name: "Defeat" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
    expect(screen.getByText(/15 Cobbles claimed/)).toBeInTheDocument();
  });

  it("lists both top 10 with the games played, the viewer's row lit", () => {
    render(wrap(<JoustScene {...JOUST.top} />));
    const own = screen.getByRole("region", { name: "The Quarrymen's top 10" });
    expect(within(own).getAllByRole("listitem")).toHaveLength(10);
    expect(within(screen.getByRole("region", { name: "Ironvale's top 10" })).getAllByRole("listitem")).toHaveLength(10);
    const mine = own.querySelector("[data-own]") as HTMLElement;
    expect(mine).toHaveTextContent("1,880");
    expect(within(mine).getByRole("img", { name: "1 of 3 games played" })).toBeInTheDocument();
  });

  it("ranks the allegiances by rating with their last move, the viewer's own named", () => {
    render(wrap(<JoustScene {...JOUST.ranking} />));
    const rows = within(screen.getByRole("list", { name: "Joust ranking" })).getAllByRole("listitem");
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent("Hollow Oak1,352+21");
    expect(rows[4]).toHaveTextContent("your allegiance");
    expect(rows[5]).toHaveTextContent("−17");
    expect(screen.getByText(/peak rating/).closest("p")).toHaveTextContent("1,201");
  });

  it("waits while read, and says why it could not be", () => {
    const { unmount } = render(wrap(<JoustScene {...JOUST.loading} />));
    expect(screen.getByLabelText("Joust")).toHaveAttribute("aria-busy", "true");
    unmount();
    render(wrap(<JoustScene {...JOUST.failed} />));
    expect(screen.getByText("The Joust could not be read.")).toBeInTheDocument();
  });
});

describe("what a better game would change (joustLift)", () => {
  const side = JOUST.live.state.match!.own;
  const me = JOUST.live.state.me!;

  it("is nothing for the side's first, a jouster with no game left or a newcomer", () => {
    expect(joustLift(side, { ...me, place: 1, best: 2_140 })).toBeNull();
    expect(joustLift(side, { ...me, left: 0 })).toBeNull();
    expect(joustLift(side, { ...me, eligible: false })).toBeNull();
  });

  it("pushes the 10th out for a jouster outside the top 10", () => {
    expect(joustLift(side, { ...me, place: 14, best: 1_200 })).toEqual({ best: 1_610, total: 18_300 });
    expect(joustLift(side, { ...me, played: 0, left: 3, place: null, best: null })).toEqual({ best: 1_610, total: 18_300 });
  });
});

describe("a joust game's end", () => {
  it("crowns a new best, shows the total it lifted and the next game", async () => {
    const onPlayAgain = vi.fn();
    render(wrap(<JoustEnd {...JOUST_END.newBest} instant onPlayAgain={onPlayAgain} />));
    expect(screen.getByRole("heading", { name: "NEW BEST" })).toBeInTheDocument();
    expect(screen.getByText("Joust · game 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Score" })).toHaveTextContent("1,9601,880 → 1,960");
    expect(screen.getByRole("region", { name: "Allegiance total" })).toHaveTextContent("18,370+80 for The Quarrymen");
    await userEvent.click(screen.getByRole("button", { name: "Play game 3" }));
    expect(onPlayAgain).toHaveBeenCalledOnce();
  });

  it("keeps the best that stands, and after the last game leads back to the joust", async () => {
    const onJoust = vi.fn();
    render(wrap(<JoustEnd {...JOUST_END.last} instant onJoust={onJoust} />));
    expect(screen.getByRole("heading", { name: "GAME OVER" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Score" })).toHaveTextContent("Best 1,880");
    expect(screen.getByRole("region", { name: "Allegiance total" })).toHaveTextContent("Unchanged");
    expect(screen.queryByRole("button", { name: /Play game/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "The joust" }));
    expect(onJoust).toHaveBeenCalledOnce();
  });

  it("says a game ended past the joust counts nowhere", () => {
    render(wrap(<JoustEnd {...JOUST_END.late} instant />));
    expect(screen.getByRole("region", { name: "Score" })).toHaveTextContent("Too late to count");
  });
});
