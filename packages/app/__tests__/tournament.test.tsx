import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlayModes } from "../src/components/containers/play-modes";
import { TournamentEnd, tournamentVerdict } from "../src/components/containers/tournament-end";
import { TournamentScene } from "../src/components/scenes/tournament-scene";
import { TOURNAMENT, TOURNAMENT_CARD, TOURNAMENT_END } from "../src/mocks/tournament";

// The Tournament's scenes (the weekly individual event) on their mocks: Play's card, the week's view in each state, the bracket, a
// game's end. The routes are `tournament-route.test.tsx`'s, the mock's rules `tournament-mock.test.ts`'s.

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

describe("Play's Tournament card", () => {
  const card = (state: keyof typeof TOURNAMENT_CARD, onTournament = vi.fn()) => {
    render(wrap(<PlayModes spawnPaused={false} {...TOURNAMENT_CARD[state]} onTournament={onTournament} />));
    return { button: screen.getByRole("button", { name: /^Tournament/ }), onTournament };
  };

  it("shows no card where the network has no Tournament", () => {
    render(wrap(<PlayModes spawnPaused={false} />));
    expect(screen.queryByRole("button", { name: /^Tournament/ })).toBeNull();
  });

  it("says the registration is open, then done, with the time left to register", () => {
    const { button } = card("open");
    expect(button).toHaveTextContent("Registration is open today");
    expect(screen.getByRole("timer", { name: "9h 40m left to register" })).toBeInTheDocument();
  });

  it("names today's round and opponent, and opens on a tap", async () => {
    const { button, onTournament } = card("duel");
    expect(button).toHaveTextContent("Semi-final · vs Vael");
    expect(screen.getByRole("timer", { name: "9h 40m left in today's round" })).toBeInTheDocument();
    await userEvent.click(button);
    expect(onTournament).toHaveBeenCalledOnce();
  });

  it.each([
    ["registered", "Registered · the draw on Tuesday"],
    ["played", "Played · midnight decides"],
    ["bye", "No duel today"],
    ["out", "Out · Cobbles to claim"],
    ["notRegistered", "Registration reopens on Monday"],
  ] as const)("says where the run stands: %s", (state, line) => {
    expect(card(state).button).toHaveTextContent(line);
  });

  it("shows the open game's score, and names the resume", () => {
    render(wrap(<PlayModes spawnPaused={false} {...TOURNAMENT_CARD.playing} />));
    expect(screen.getByRole("button", { name: "Tournament: resume your game, 3,120 points" })).toHaveTextContent("3,120");
  });
});

describe("the Tournament's view", () => {
  const view = (state: keyof typeof TOURNAMENT, handlers: Partial<Parameters<typeof TournamentScene>[0]> = {}) => render(wrap(<TournamentScene {...TOURNAMENT[state]} {...handlers} />));

  it("waits while the week is read, and says why it could not be", () => {
    view("loading");
    expect(screen.getByLabelText("Tournament")).toHaveAttribute("aria-busy", "true");
    view("failed");
    expect(screen.getByText("The Tournament could not be read.")).toBeInTheDocument();
  });

  it("opens the registration on Monday: the league, its players, the Cobbles by round, Register", async () => {
    const onRegister = vi.fn();
    view("registration", { onRegister });
    expect(screen.getByText("Registration · Monday")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("Registration closes at 24:00 UTC · in 9h 40m");
    expect(screen.getByText("Gold league")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();
    const prizes = screen.getByRole("region", { name: "Cobbles by round" });
    expect(within(prizes).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Round of 64, played5", "Round of 3210", "Round of 1620", "Quarter-final40", "Semi-final80", "Final150", "Champion300"]);
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(onRegister).toHaveBeenCalledOnce();
  });

  it("says the player is registered, and holds Register while it is sent", () => {
    view("registered");
    expect(screen.getByText(/You are registered/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).toBeNull();
    view("registering");
    expect(screen.getByRole("button", { name: "Register" })).toBeDisabled();
  });

  it("shows today's duel: the opponent's game as the target, what winning secures, the deck, Play", async () => {
    const onPlay = vi.fn();
    const onDeck = vi.fn();
    const onBracket = vi.fn();
    view("duel", { onPlay, onDeck, onBracket });
    expect(screen.getByText("Saturday · Semi-final")).toBeInTheDocument();
    expect(screen.getByText(/Gold league/).closest("p")).toHaveTextContent("Gold league · bracket 2 of 3 · 50 players");
    const duel = document.querySelector('[data-slot="tournament-duel"]') as HTMLElement;
    expect(duel).toHaveTextContent("Saturday's semi-final · one game each");
    expect(duel).toHaveTextContent("Vael5,486played at 09:12 UTC");
    expect(duel).toHaveTextContent("150 Cobbles if you go through");
    expect(document.querySelector('[data-own]')).toHaveTextContent("Semi-final80");
    await userEvent.click(screen.getByRole("button", { name: /The round's deck/ }));
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: "The bracket" }));
    expect([onDeck.mock.calls.length, onPlay.mock.calls.length, onBracket.mock.calls.length]).toEqual([1, 1, 1]);
  });

  it("follows the day's game: the opponent still to play, a game open, a game played, a walkover", () => {
    view("duelFirst");
    expect(document.querySelector('[data-slot="tournament-duel"]')).toHaveTextContent("has not played yet");
    view("playing");
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    view("played");
    expect(screen.getByText("Played today")).toBeInTheDocument();
    expect(screen.getByText(/Midnight decides/)).toHaveTextContent("Sunday's final");
    view("walkover");
    expect(document.querySelector('[data-kind="walkover"]')).toHaveTextContent("Play the round's game to go through");
  });

  it("says a bye of the draw has no duel today and when the first one is, and that a small group was carried down", () => {
    view("bye");
    expect(document.querySelector('[data-kind="bye"]')).toHaveTextContent("you skip the round of 64 and start on Wednesday, in the round of 32.");
    expect(screen.getByText("No duel today")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    view("carried");
    expect(screen.getByText(/Too few Master players registered/)).toHaveTextContent("your group joined Emerald's");
  });

  it("shows a run that is out with its Cobbles to claim, then claimed; and the week drawn without the player", async () => {
    const onClaim = vi.fn();
    const { unmount } = view("out", { onClaim });
    expect(screen.getByRole("heading", { name: "Out in the round of 16" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Claim +20 Cobbles" }));
    expect(onClaim).toHaveBeenCalledWith(TOURNAMENT.out.state.run.week);
    unmount();
    view("outClaimed");
    expect(screen.getByText(/20 Cobbles claimed/)).toBeInTheDocument();
    view("notRegistered");
    expect(screen.getByText(/You did not register on Monday/)).toBeInTheDocument();
  });

  it("crowns last week's champion on Monday: the title, the Claim", () => {
    view("champion");
    const result = screen.getByRole("region", { name: "Last week" });
    expect(within(result).getByRole("heading", { name: "Champion!" })).toBeInTheDocument();
    expect(result).toHaveTextContent("Champion of the Tournament, Gold league. 6 duels won.");
    expect(within(result).getByRole("button", { name: "Claim +300 Cobbles" })).toBeInTheDocument();
  });

  it("draws the bracket: the path round by round, and the last eight as far as it is known", async () => {
    const onOpenPlayer = vi.fn();
    view("bracket", { onOpenPlayer });
    const path = within(screen.getByRole("region", { name: "Your path" })).getAllByRole("listitem");
    expect(path.map((li) => li.getAttribute("data-outcome"))).toEqual(["won", "won", "won", "won", "pending"]);
    expect(path[4]).toHaveTextContent("Semi-finalSat ·vsVael— : 5,486Today");
    expect(screen.getByRole("group", { name: "Quarter-final" }).querySelectorAll('[data-slot="tournament-match"]')).toHaveLength(4);
    expect(screen.getByRole("group", { name: "Final" })).toHaveTextContent("Decided once Saturday is over.");
    // The viewer's rows are lit; a player with a profile opens it, the field's have none.
    expect(document.querySelectorAll("[data-own]")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Vael" })).toBeNull();
    await userEvent.click(within(screen.getByRole("group", { name: "Quarter-final" })).getAllByRole("button")[0]!);
    expect(onOpenPlayer).toHaveBeenCalledOnce();
  });

  it("says when the brackets are drawn before there is one", () => {
    view("bracketNone");
    expect(screen.getByText(/The brackets are drawn on Tuesday/)).toBeInTheDocument();
  });
});

describe("a Tournament game's end", () => {
  const end = (state: keyof typeof TOURNAMENT_END, onTournament = vi.fn()) => {
    render(wrap(<TournamentEnd {...TOURNAMENT_END[state]} instant onTournament={onTournament} />));
    return onTournament;
  };

  it.each([
    ["through", "THROUGH", "Vael · 5,486", "150", "Cobbles secured"],
    ["out", "OUT", "Vael · 5,486", "80", "Cobbles, claimed from Sunday"],
    ["waiting", "PLAYED", "Vael has not played yet", "150", "Cobbles if you go through"],
    ["ahead", "AHEAD", "Vael · 4,120 in play", "150", "Cobbles if you go through"],
    ["behind", "BEHIND", "Vael · 5,486 in play", "150", "Cobbles if you go through"],
    ["walkover", "THROUGH", "Nobody opposite: through by playing", "150", "Cobbles secured"],
    ["won", "THROUGH", "Vael · 5,486", "150", "Cobbles secured"],
    ["lost", "OUT", "Vael · 5,486", "80", "Cobbles, claimed from Sunday"],
    ["champion", "CHAMPION", "6,102", "300", "Cobbles secured"],
  ] as const)("%s: %s", (state, verdict, scoreLine, cobbles, cobblesLine) => {
    end(state);
    expect(screen.getByText(verdict)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Score" })).toHaveTextContent(scoreLine);
    expect(screen.getByTestId("cobbles-value")).toHaveTextContent(cobbles);
    expect(screen.getByRole("region", { name: "Cobbles" })).toHaveTextContent(cobblesLine);
  });

  it("waits for the result, names the round, and goes back to the tournament: no next game", async () => {
    end("reading");
    expect(screen.getByText("GAME OVER")).toBeInTheDocument();
    const onTournament = end("through");
    expect(screen.getByText("Tournament · Semi-final")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "The tournament" }).at(-1)!);
    expect(onTournament).toHaveBeenCalledOnce();
  });

  it("settles a duel before midnight only once both games are over", () => {
    expect(tournamentVerdict(TOURNAMENT_END.through.result)).toEqual({ verdict: "THROUGH", through: true });
    expect(tournamentVerdict(TOURNAMENT_END.ahead.result)).toEqual({ verdict: "AHEAD", through: null });
    expect(tournamentVerdict(TOURNAMENT_END.waiting.result)).toEqual({ verdict: "PLAYED", through: null });
  });
});
