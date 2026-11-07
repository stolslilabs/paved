import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CENTER } from "@paved/game-core";
import { LEAGUES, STAR_MARKS, STAR_PERCENTS, crownsFor, leagueOf, nextLeague, starPoints, starsFor } from "../src/lib/pvp-rules";
import { StarMeter } from "../src/components/elements/star-meter";
import type { StackFrame } from "../src/components/containers/tile-stack";
import { PvpAttackScene } from "../src/components/scenes/pvp-attack-scene";
import { PvpLeagueScene } from "../src/components/scenes/pvp-league-scene";
import { PvpResultScene } from "../src/components/scenes/pvp-result-scene";
import { PvpScoutScene } from "../src/components/scenes/pvp-scout-scene";
import { PvpSearchScene } from "../src/components/scenes/pvp-search-scene";
import {
  ATTACK_SCORES,
  ATTACK_STEPS,
  MATCHES,
  MY_VILLAGE,
  PVP_ATTACK,
  PVP_LEAGUE,
  PVP_REPLAY,
  PVP_RESULT,
  PVP_SCOUT,
  PVP_SEARCH,
  RIVAL,
  RIVAL_VILLAGE,
  STAKES,
} from "../src/mocks/pvp";
import { playAttack } from "../src/mocks/pvp-attack";
import { PVP_MATCH } from "../src/mocks/pvp-match";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

afterEach(cleanup);

describe("PvP rules (#647)", () => {
  it("counts the stars at 70 / 85 / 110 % of the village, rounded up", () => {
    expect(STAR_MARKS).toEqual([0.7, 0.85, 1.1]);
    expect(starPoints(5_831)).toEqual([4_082, 4_957, 6_415]);
    expect(starsFor(4_081, 5_831)).toBe(0);
    expect(starsFor(4_082, 5_831)).toBe(1);
    expect(starsFor(4_957, 5_831)).toBe(2);
    expect(starsFor(6_415, 5_831)).toBe(3);
  });

  it("awards each star at exactly its share, never one point late (integer marks, no floating-point rounding)", () => {
    expect(starPoints(5_130)).toEqual([3_591, 4_361, 5_643]);
    expect(starsFor(5_643, 5_130)).toBe(3);
    expect(crownsFor(STAKES, starsFor(5_643, 5_130))).toBe(30);
    expect(starsFor(110, 100)).toBe(3);
    expect(starsFor(109, 100)).toBe(2);
    for (let target = 1; target <= 20_000; target++) {
      const points = starPoints(target);
      points.forEach((p, i) => {
        expect(p * 100).toBeGreaterThanOrEqual(STAR_PERCENTS[i]! * target);
        expect((p - 1) * 100).toBeLessThan(STAR_PERCENTS[i]! * target);
        if (starsFor(p, target) < i + 1 || starsFor(p - 1, target) >= i + 1) throw new Error(`target ${target}, star ${i + 1}`);
      });
    }
  });

  it("wins crowns by stars and loses them with none", () => {
    expect([0, 1, 2, 3].map((s) => crownsFor(STAKES, s))).toEqual([-20, 10, 20, 30]);
  });

  it("puts every crown count in one league, the last open-ended", () => {
    expect(leagueOf(0).id).toBe("wood");
    expect(leagueOf(400).name).toBe("Iron III");
    expect(leagueOf(1_199).name).toBe("Bronze II");
    expect(leagueOf(1_200).name).toBe("Bronze I");
    expect(leagueOf(99_999).id).toBe("grandmaster");
    expect(nextLeague(LEAGUES.at(-1)!)).toBeNull();
  });

  it("names leagues 13 to 15 Emerald, Platinum's old place (#917)", () => {
    expect(LEAGUES.slice(13, 16).map((l) => [l.id, l.name, l.from])).toEqual([
      ["emerald", "Emerald III", 2_600],
      ["emerald", "Emerald II", 2_800],
      ["emerald", "Emerald I", 3_000],
    ]);
    expect(LEAGUES.some((l) => /platinum/i.test(`${l.id} ${l.name}`))).toBe(false);
  });
});

describe("PvP fakes, played on the engine", () => {
  it("builds villages of 38 tiles, each on its own cell", () => {
    for (const v of [RIVAL_VILLAGE, MY_VILLAGE]) {
      expect(v.tiles).toHaveLength(38);
      expect(new Set(v.cells.map((c) => `${c.x},${c.y}`)).size).toBe(38);
    }
  });

  it("places every attack tile on a cell of the defender's territory, and draws the defender's plans", () => {
    const territory = new Set(RIVAL_VILLAGE.cells.map((c) => `${c.x},${c.y}`));
    const last = ATTACK_STEPS.at(-1)!;
    for (const t of last.tiles) expect(territory.has(`${t.x},${t.y}`)).toBe(true);
    for (const step of ATTACK_STEPS) for (const s of step.slots) expect(territory.has(`${s.x},${s.y}`)).toBe(true);
    const plans = (tiles: { plan: number }[]) => tiles.map((t) => t.plan).sort((a, b) => a - b);
    const discarded = last.discarded;
    expect(last.tiles.length + discarded).toBe(RIVAL_VILLAGE.tiles.length);
    if (discarded === 0) expect(plans(last.tiles)).toEqual(plans([...RIVAL_VILLAGE.tiles]));
    expect(last.tiles[0]).toMatchObject({ x: CENTER, y: CENTER });
  });

  it("keeps the final scores the result and the log quote", () => {
    for (const [seed, score] of Object.entries(ATTACK_SCORES.rival)) expect(playAttack(RIVAL_VILLAGE, Number(seed)).at(-1)!.score).toBe(score);
    for (const [seed, score] of Object.entries(ATTACK_SCORES.mine)) expect(playAttack(MY_VILLAGE, Number(seed)).at(-1)!.score).toBe(score);
  });
});

describe("PvP scenes (#647)", () => {
  it("search: says it searches near the crowns, Cancel stops it", async () => {
    const onCancel = vi.fn();
    render(wrap(<PvpSearchScene {...PVP_SEARCH.searching} onCancel={onCancel} />));
    expect(screen.getByRole("heading", { name: "Searching for a rival" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "1,172 crowns" })).toBeInTheDocument();
    // The window's two actions: Cancel, and the gold action held while the draw runs.
    expect(screen.getByRole("button", { name: "Searching" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    // The clouds left (the user's ask): no sky, the board's ground or the page's void.
    expect(document.querySelector(".from-sky-search-top")).toBeNull();
  });

  it("search: found names the defender; none and error offer a new search", () => {
    render(wrap(<PvpSearchScene {...PVP_SEARCH.found} />));
    expect(screen.getByRole("heading", { name: "Rival found" })).toBeInTheDocument();
    expect(screen.getByText("Rook of Ashford")).toBeInTheDocument();
    // Cancel keeps its place, dimmed: the page moves on to the scout.
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    cleanup();
    render(wrap(<PvpSearchScene {...PVP_SEARCH.none} onRetry={() => {}} />));
    expect(screen.getByRole("heading", { name: "No rival in range" })).toBeInTheDocument();
    // Nothing drawn: the gold action is Search, beside Cancel, in their places.
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    cleanup();
    render(wrap(<PvpSearchScene {...PVP_SEARCH.error} />));
    expect(screen.getByText(/matchmaker did not answer/)).toBeInTheDocument();
  });

  it("scout: the village's score, each star's points, Next's price; the crowns at stake behind the info button", async () => {
    const onNext = vi.fn();
    const onAttack = vi.fn();
    render(wrap(<PvpScoutScene {...PVP_SCOUT.ready} onNext={onNext} onAttack={onAttack} />));
    // The crowns at stake in the panel (the user's ask of 2026-11-07): the defeat's loss, then each star's points and crowns.
    const stakes = within(screen.getByRole("list", { name: "Crowns at stake" })).getAllByRole("listitem");
    expect(stakes.map((s) => s.getAttribute("aria-label"))).toEqual(["No star, under 4,082 points: -20 crowns", "1 star, 4,082 points: +10 crowns", "2 stars, 4,957 points: +20 crowns", "3 stars, 6,415 points: +30 crowns"]);
    expect(stakes.map((s) => s.querySelector("[data-crowns]")!.textContent)).toEqual(["\u221220", "+10", "+20", "+30"]);
    // The rival in the bottom panel (the user's asks): avatar in its rim (the crest on it, no other), name, guild; no level, no score.
    const rival = within(screen.getByRole("region", { name: "Attack" })).getByRole("region", { name: "Rival" });
    expect(rival.querySelectorAll("[data-slot=league-crest-icon]")).toHaveLength(1);
    expect(within(rival).queryByRole("img", { name: /^Level / })).toBeNull();
    // No guild (v1's fakes give none): an empty shield under the name, no league written out; no village score (the user's ask).
    expect(within(rival).getByRole("img", { name: "No guild" })).toBeInTheDocument();
    expect(within(rival).queryByRole("group", { name: /^Village score/ })).toBeNull();
    expect(screen.getByRole("img", { name: /Board of 38 tiles in a territory of 38 cells/ })).toBeInTheDocument();
    // v1 has no tile list: the deck over the village only counts the tiles.
    expect(screen.getByRole("img", { name: "38 tiles" })).toHaveAttribute("data-deck");
    expect(screen.queryByRole("button", { name: /^Deck/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "How an attack works" }));
    expect(await screen.findByText("You play the defender's tiles, drawn at random, on their cells.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Next village for 1 Cobbles" }));
    await userEvent.click(screen.getByRole("button", { name: /Attack/ }));
    expect(onNext).toHaveBeenCalled();
    expect(onAttack).toHaveBeenCalled();
  });

  it("scout: a light overlay over the whole village; warns that attacking drops the shield, and disables Next without the Cobbles", async () => {
    const { container } = render(wrap(<PvpScoutScene {...PVP_SCOUT.shielded} />));
    expect(screen.getByText("Attacking drops your shield")).toBeInTheDocument();
    // The header's shield in the same HHhMMm as everywhere (#829), named in words.
    expect(screen.getByRole("timer", { name: "Shielded, 5 hours 12 minutes left" })).toHaveTextContent(/^05h12m$/);
    // Above Attack, one line says it, with the shield's time left (#806, open point 1).
    expect(screen.getByRole("region", { name: "Attack" }).querySelector("[data-shield-warning]")).toHaveTextContent("Attacking drops your shield, 05h12m left");
    // The chip sits in the header row, the bottom card keeps its height; a tap on it tells the rule.
    expect(screen.getByRole("banner").querySelector("[data-shield]")).not.toBeNull();
    // The board fills the scene at every width (#788); the cards float over it, at its top and bottom.
    const board = container.querySelector("[data-scout-board]")!;
    expect(board.className).toMatch(/\babsolute inset-0\b/);
    const card = screen.getByRole("region", { name: "Attack" });
    expect(board.contains(card)).toBe(false);
    expect(card.closest(".pointer-events-none")!.className).toMatch(/\bpointer-events-none absolute inset-0\b/);
    expect(card.className).toMatch(/\bpointer-events-auto\b/);
    // The rules' sentences went behind the info button.
    expect(card).not.toHaveTextContent(/You play/);
    await userEvent.click(screen.getByRole("button", { name: /Attacking drops your shield/ }));
    expect(await screen.findByText("Attacking drops your shield.")).toBeInTheDocument();
    cleanup();
    render(wrap(<PvpScoutScene {...PVP_SCOUT.short} />));
    expect(document.querySelector("[data-shield-warning]")).toBeNull();
    expect(screen.getByRole("button", { name: /not enough Cobbles/ })).toBeDisabled();
  });

  it("attack: the territory, the slots inside it, the meter and the tiles left", () => {
    render(wrap(<PvpAttackScene {...PVP_ATTACK.midway} />));
    const board = screen.getByRole("group", { name: /in a territory of 38 cells/ });
    expect(board.querySelectorAll("[data-territory]")).toHaveLength(38);
    expect(within(board).getAllByRole("button", { name: /^Slot/ })).toHaveLength(PVP_ATTACK.midway.slots!.length);
    expect(screen.getByRole("meter", { name: /of the target/ })).toHaveAttribute("aria-valuenow", String(Math.round((PVP_ATTACK.midway.score / RIVAL_VILLAGE.score) * 100)));
    expect(screen.getByRole("heading", { name: "Attack: Rook of Ashford" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Tiles left/ })).toHaveTextContent(String(PVP_ATTACK.midway.remaining));
  });

  it("attack: the stack as the game's board draws it (#701): the next two tiles of the draw, the 3D view, the pile from the defender's tiles", () => {
    const frames: StackFrame[] = [];
    const renderHandStack = (v: StackFrame) => {
      frames.push(v);
      return <span data-testid="stack-3d" />;
    };
    const { rerender } = render(wrap(<PvpAttackScene {...PVP_ATTACK.midway} />));
    // The fakes' draw: the hands of the next two steps.
    const next = ATTACK_STEPS.slice(19, 21).map((s) => s.hand!.plan);
    expect(PVP_ATTACK.midway.hand.coming?.map((t) => t.plan)).toEqual(next);
    expect(screen.getByTestId("coming-tiles").querySelectorAll("li")).toHaveLength(2);
    rerender(wrap(<PvpAttackScene {...PVP_ATTACK.midway} renderHandStack={renderHandStack} />));
    expect(screen.getByTestId("stack-3d")).toBeInTheDocument();
    const tiles = frames.at(-1)!.tiles;
    expect(tiles.filter((t) => t.thickness === undefined).map((t) => t.plan)).toEqual([...next, PVP_ATTACK.midway.hand.tile!.plan]);
    const deck = new Set(RIVAL_VILLAGE.tiles.map((t) => t.plan));
    expect(tiles.filter((t) => t.thickness !== undefined).every((t) => deck.has(t.plan))).toBe(true);
    // The last tile: nothing after it.
    cleanup();
    render(wrap(<PvpAttackScene {...PVP_ATTACK.lastTile} />));
    expect(screen.queryByTestId("coming-tiles")).toBeNull();
  });

  it("attack: the meter lights a star past 70 %", () => {
    render(wrap(<PvpAttackScene {...PVP_ATTACK.oneStar} />));
    expect(screen.getByRole("meter")).toHaveAttribute("data-stars", "1");
  });

  it("replay: no hand, the replay's controls step", async () => {
    const onStep = vi.fn();
    render(wrap(<PvpAttackScene {...PVP_REPLAY.paused} replay={{ ...PVP_REPLAY.paused.replay!, onStep }} />));
    expect(screen.queryByRole("button", { name: /^Tiles left/ })).toBeNull();
    expect(screen.getByRole("group", { name: "Replay" })).toHaveTextContent("Move 20/37");
    await userEvent.click(screen.getByRole("button", { name: "Next move" }));
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("star meter: three stars past 110 %", () => {
    render(<StarMeter score={6_415} target={5_831} />);
    expect(screen.getByRole("meter")).toHaveAttribute("data-stars", "3");
  });

  it("result: stars, crowns, league; Choose opens the village with #646's reward sheet, a choice closes it", async () => {
    const onTakeCobbles = vi.fn();
    render(wrap(<PvpResultScene {...PVP_RESULT.twoStars} onTakeCobbles={onTakeCobbles} />));
    expect(screen.getByRole("img", { name: "2 of 3 stars" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "+20 crowns" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Choose/ }));
    const dialog = await screen.findByRole("dialog", { name: "Village reward" });
    const tiles = within(within(dialog).getByRole("list", { name: "Reward tiles" })).getAllByRole("button");
    expect(tiles).toHaveLength(3);
    await userEvent.click(tiles[0]!);
    expect(within(dialog).getAllByRole("button", { name: /^Place it at/ }).length).toBeGreaterThan(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Take 5 Cobbles instead" }));
    expect(onTakeCobbles).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Village reward" })).toBeNull());
  });

  it("result: the reward taken, a tile or the Cobbles", () => {
    render(wrap(<PvpResultScene {...PVP_RESULT.rewardPlaced} />));
    expect(screen.getByText("Placed in your village.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Choose/ })).toBeNull();
    cleanup();
    render(wrap(<PvpResultScene {...PVP_RESULT.rewardCobbles} />));
    expect(screen.getByRole("img", { name: "+5 Cobbles" })).toBeInTheDocument();
  });

  it("result: a promotion, the daily cap, a defeat with no reward", () => {
    render(wrap(<PvpResultScene {...PVP_RESULT.threeStarsPromoted} />));
    expect(screen.getByText("Promoted to")).toBeInTheDocument();
    cleanup();
    render(wrap(<PvpResultScene {...PVP_RESULT.oneStarCapped} />));
    expect(screen.getByText(/Today's rewards are all taken/)).toBeInTheDocument();
    cleanup();
    render(wrap(<PvpResultScene {...PVP_RESULT.defeat} />));
    expect(screen.getByRole("heading", { name: "Defeat" })).toBeInTheDocument();
    expect(screen.getByText(/No star, no reward/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Choose/ })).toBeNull();
  });

  it("league (LEAGUE-PAGE): the HUD's drawer, its title, the League control at the header's end, the carousel, the season and the battle logs", () => {
    const onBack = vi.fn();
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} onBack={onBack} />));
    const drawer = screen.getByRole("dialog", { name: "League" });
    expect(drawer).toHaveAttribute("data-hud-drawer", "league");
    const band = drawer.querySelector<HTMLElement>("[data-slot=sheet-header]")!;
    expect(within(band).getByRole("button", { name: "Your league: Bronze II, 1,172 crowns. Show it" })).toBeInTheDocument();
    expect(within(drawer).getByRole("region", { name: "Leagues" })).toBeInTheDocument();
    expect(within(drawer).getByRole("region", { name: "Season" })).toBeInTheDocument();
    expect(within(drawer).getByRole("heading", { name: "Battle logs" })).toBeInTheDocument();
  });

  it("league's waits and refusals (LEAGUE-PAGE): in the drawer, its title kept, no League control", async () => {
    const onRetry = vi.fn();
    const base = { crowns: 0, season: null, now: PVP_LEAGUE.bronze.now };
    // No Connect (NO-GUEST): the account still read is the league's loading.
    render(wrap(<PvpLeagueScene {...base} wait={{ kind: "unavailable" }} />));
    expect(screen.getByRole("dialog", { name: "League" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Your league/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(screen.getByText("PvP is not on this network yet.")).toBeInTheDocument();
    cleanup();
    render(wrap(<PvpLeagueScene {...base} wait={{ kind: "loading" }} />));
    expect(screen.getByRole("status", { name: "Loading your league" })).toBeInTheDocument();
    cleanup();
    render(wrap(<PvpLeagueScene {...base} wait={{ kind: "error", message: "No RPC", onRetry }} />));
    expect(screen.getByText("No RPC")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("league's battle logs (#786, #834; LEAGUE-PAGE): attacks and defences as rows, newest first, each opening its match; no shield (#859)", async () => {
    const onOpenMatch = vi.fn();
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} onOpenMatch={onOpenMatch} />));
    expect(screen.getByRole("heading", { name: "Battle logs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Defence log" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Shield" })).toBeNull();
    expect(screen.queryByText(/shield/i)).toBeNull();
    const cards = within(screen.getByRole("list", { name: "Matches" })).getAllByRole("button");
    expect(cards).toHaveLength(MATCHES.length);
    // Attacks and defences mixed, newest first, each told apart.
    expect(cards.map((c) => c.dataset.side)).toEqual(MATCHES.map((m) => m.side));
    expect(cards[0]).toHaveAccessibleName(`Your attack on ${RIVAL.name}: ${MATCHES[0]!.stars} of 3 stars`);
    expect(cards[1]).toHaveAccessibleName(`Vael's attack on your village: ${MATCHES[1]!.stars} of 3 stars`);
    // A row (the book's): the side's badge and name, the rival in their league's rim, the crowns, the stars, the time in its largest
    // unit; behind a vertical rule the score, an attack's XP and its chest's icon, no label; no background art.
    expect(cards[0]!.querySelector("[inert]")).toBeNull();
    expect(cards[0]!.querySelector("[data-slot=match-art]")).toBeNull();
    expect(within(cards[0]!).getByText("Attack")).toBeInTheDocument();
    expect(cards[0]!.querySelector("[data-icon=attack]")).not.toBeNull();
    expect(cards[1]!.querySelector("[data-icon=shield]")).not.toBeNull();
    expect(cards[0]!.querySelector("[data-slot=rival-rim]")).toHaveAttribute("data-tier", MATCHES[0]!.league!.id);
    expect(within(cards[0]!).getByRole("img", { name: `${MATCHES[0]!.stars} of 3 stars` })).toBeInTheDocument();
    expect(within(cards[0]!).getByRole("img", { name: `+${MATCHES[0]!.crowns} crowns` })).toBeInTheDocument();
    expect(within(cards[0]!).getByTestId("match-score")).toHaveTextContent(/^[\d,]+$/);
    expect(within(cards[0]!).queryByText(/ \/ /)).toBeNull();
    expect(within(cards[0]!).getByText("40min ago")).toBeInTheDocument();
    expect(within(cards[1]!).getByText("2h ago")).toBeInTheDocument();
    expect(within(cards[0]!).getByTestId("match-xp")).toHaveTextContent(`+${MATCHES[0]!.xp} XP`);
    expect(within(within(cards[0]!).getByTestId("match-rewards")).getByRole("img", { name: "Rare chest" })).toBeInTheDocument();
    expect(within(cards[0]!).queryByText("Rare chest")).toBeNull();
    expect(within(cards[0]!).getByTestId("match-rewards")).toContainElement(within(cards[0]!).getByTestId("match-score"));
    expect(within(cards[1]!).getByText("Defence")).toBeInTheDocument();
    expect(within(cards[1]!).getByRole("img", { name: `${MATCHES[1]!.crowns} crowns` })).toBeInTheDocument();
    expect(within(cards[1]!).queryByTestId("match-xp")).toBeNull();
    expect(within(cards[1]!).getByTestId("match-rewards").querySelector("img")).toBeNull();
    // Lost crowns in the loss colour, won ones in the gain colour.
    expect(cards.map((c) => c.dataset.lost)).toEqual(MATCHES.map((m) => String(m.crowns < 0)));
    for (const c of cards) {
      const figure = c.querySelector("[data-slot=match-crowns] > span[aria-hidden]")!;
      expect(figure.classList.contains("text-warning")).toBe(c.dataset.lost === "true");
    }
    await userEvent.click(cards[1]!);
    expect(onOpenMatch).toHaveBeenCalledWith(MATCHES[1]!.id);
    cleanup();
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.matchesEmpty} />));
    expect(screen.getByText(/No match yet/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Shield" })).toBeNull();
  });

  it("league's matches: the latest 20, then 20 more with Show more (open point 3); v1's rows have no XP nor chest, a plain ring", async () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.matchesMany} />));
    const list = () => within(screen.getByRole("list", { name: "Matches" })).getAllByRole("button");
    expect(list()).toHaveLength(20);
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(list()).toHaveLength(26);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    cleanup();
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.matchesNoSnapshot} />));
    expect(list().every((c) => c.querySelector("[data-slot=rival-rim]:not([data-tier])") !== null)).toBe(true);
    expect(screen.queryByTestId("match-xp")).toBeNull();
    expect(screen.getAllByTestId("match-rewards").every((r) => r.querySelector("img") === null)).toBe(true);
  });

  it("league: the crowns in the header; the season in one row, its calendar, its reward, its countdown (#859, LEAGUE-PAGE)", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} />));
    expect(screen.getByRole("button", { name: "Your league: Bronze II, 1,172 crowns. Show it" })).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    const season = screen.getByRole("region", { name: "Season" });
    expect(season.querySelector("[data-icon=season]")).not.toBeNull();
    expect(within(season).getByRole("heading")).toHaveTextContent(/^Season 3$/);
    expect(within(season).getByRole("timer")).toHaveTextContent("4d 3h");
    expect(within(season).getByRole("timer")).toHaveClass("drawer-carved", "text-foreground");
    expect(within(season).queryByText(/attacks/)).toBeNull();
    expect(screen.getByTestId("season-reward")).toHaveTextContent(/^Bronze II at the season's end:\s*\+20$/);
    expect(within(screen.getByTestId("season-reward")).getByRole("img", { name: "+20 Cobbles" })).toBeInTheDocument();
    expect(screen.queryByText(/claim/i)).toBeNull();
    expect(screen.getByRole("group", { current: true })).toHaveAccessibleName("Bronze II");
    cleanup();
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.wood} />));
    expect(screen.getByRole("heading", { name: "Wood" })).toBeInTheDocument();
    cleanup();
    // No attack yet (#917): Unranked's card, before Wood's.
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.unranked} />));
    expect(screen.getByRole("heading", { name: "Unranked" })).toBeInTheDocument();
    expect(screen.getByRole("group", { current: true })).toHaveAccessibleName("Unranked");
    cleanup();
    // An open attack holds 20 crowns: the chain says Iron III (the whole count, 400) while showing 380.
    render(wrap(<PvpLeagueScene crowns={380} league={1} season={PVP_LEAGUE.bronze.season} now={PVP_LEAGUE.bronze.now} />));
    expect(screen.queryByRole("heading", { name: "Wood" })).toBeNull();
    expect(screen.getAllByText("Iron III").length).toBeGreaterThan(0);
    expect(screen.getByRole("group", { current: true })).toHaveAccessibleName("Iron III");
    // The header's control and the season's reward follow the chain's league, not the count shown.
    expect(screen.getByRole("button", { name: "Your league: Iron III, 380 crowns. Show it" })).toHaveAttribute("data-league", "iron");
    expect(screen.getByTestId("season-reward")).toHaveTextContent(/^Iron III at the season's end:\s*\+10$/);
  });

  it("league's season (#859): its last day in the warning colour; Wood's way to a reward; the end; before the first", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.lastDay} />));
    expect(within(screen.getByRole("region", { name: "Season" })).getByRole("timer")).toHaveClass("text-warning");
    expect(within(screen.getByRole("region", { name: "Season" })).getByRole("timer")).toHaveTextContent("5h 20m");
    cleanup();
    for (const wood of [PVP_LEAGUE.unranked, PVP_LEAGUE.wood, PVP_LEAGUE.demoted]) {
      render(wrap(<PvpLeagueScene {...wood} />));
      expect(screen.getByTestId("season-reward")).toHaveTextContent("Reach Iron III to earn Cobbles");
      cleanup();
    }
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.ended} />));
    const season = screen.getByRole("region", { name: "Season" });
    expect(within(season).getByText("Its rewards are on their way")).toBeInTheDocument();
    expect(within(season).getByText("Ended")).toBeInTheDocument();
    expect(within(season).queryByRole("timer")).toBeNull();
    expect(screen.queryByTestId("season-reward")).toBeNull();
    cleanup();
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} season={null} />));
    expect(within(screen.getByRole("region", { name: "Season" })).getByRole("heading")).toHaveTextContent("Before the first season");
  });
});

describe("PvP stories", () => {
  // One story per state: the stories list the fixtures' keys (the SC2 rule, held here for the PvP scenes).
  const scenes = join(__dirname, "../src/components/scenes");
  const exportsOf = (file: string) => [...readFileSync(join(scenes, file), "utf8").matchAll(/^export const (\w+)/gm)].map((m) => m[1]);
  it.each([
    ["pvp-search-scene.stories.tsx", PVP_SEARCH],
    ["pvp-scout-scene.stories.tsx", PVP_SCOUT],
    ["pvp-result-scene.stories.tsx", PVP_RESULT],
    ["pvp-league-scene.stories.tsx", PVP_LEAGUE],
    ["pvp-match-scene.stories.tsx", PVP_MATCH],
  ])("%s has a story per state", (file, fixtures) => {
    const text = readFileSync(join(scenes, file), "utf8");
    for (const key of Object.keys(fixtures)) expect(text).toMatch(new RegExp(`\\.${key}\\b`));
    expect(exportsOf(file).length).toBeGreaterThanOrEqual(Object.keys(fixtures).length);
  });
});
