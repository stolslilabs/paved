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
  PVP_MATCHES,
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
    expect(leagueOf(0).id).toBe("wanderer");
    expect(leagueOf(400).name).toBe("Peasant III");
    expect(leagueOf(1_199).name).toBe("Yeoman II");
    expect(leagueOf(1_200).name).toBe("Yeoman I");
    expect(leagueOf(99_999).id).toBe("sovereign");
    expect(nextLeague(LEAGUES.at(-1)!)).toBeNull();
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
    expect(screen.getByRole("heading", { name: "Searching for a village" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "1,172 crowns" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("search: found names the defender; none and error offer a new search", () => {
    render(wrap(<PvpSearchScene {...PVP_SEARCH.found} />));
    expect(screen.getByText("Rook of Ashford")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    cleanup();
    render(wrap(<PvpSearchScene {...PVP_SEARCH.none} />));
    expect(screen.getByRole("heading", { name: "No village in range" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Search again/ })).toBeInTheDocument();
    cleanup();
    render(wrap(<PvpSearchScene {...PVP_SEARCH.error} />));
    expect(screen.getByText(/matchmaker did not answer/)).toBeInTheDocument();
  });

  it("scout: the village's score, each star's points, Next's price; the crowns at stake behind the info button", async () => {
    const onNext = vi.fn();
    const onAttack = vi.fn();
    render(wrap(<PvpScoutScene {...PVP_SCOUT.ready} onNext={onNext} onAttack={onAttack} />));
    expect(screen.getByText("5,831")).toBeInTheDocument();
    const stars = within(screen.getByRole("list", { name: "Stars" })).getAllByRole("listitem");
    expect(stars.map((s) => s.textContent)).toEqual(["4,082", "4,957", "6,415"]);
    expect(screen.getByRole("img", { name: /Board of 38 tiles in a territory of 38 cells/ })).toBeInTheDocument();
    // v1 has no tile list: the deck chip only counts the tiles.
    expect(document.querySelector("[data-deck]")).toHaveTextContent("38 tiles");
    expect(screen.queryByRole("button", { name: /tile list/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "How an attack works" }));
    const crowns = within(await screen.findByRole("list", { name: "Crowns at stake" })).getAllByRole("listitem");
    expect(crowns.map((s) => s.textContent)).toEqual(["4,082 points+10", "4,957 points+20", "6,415 points+30", "No star\u221220"]);
    expect(screen.getByRole("img", { name: "-20 crowns" })).toBeInTheDocument();
    expect(screen.getByText("You play the defender's tiles, drawn at random, on their cells.")).toBeInTheDocument();
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
    expect(card.parentElement!.className).toMatch(/\bpointer-events-none absolute inset-0\b/);
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

  it("league's battle logs without the build's renders (#857): the cards keep their own colour, no image behind", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.yeoman} matches={{ ...PVP_MATCHES.shielded, renders: undefined }} />));
    const cards = within(screen.getByRole("list", { name: "Matches" })).getAllByRole("button");
    expect(cards.every((c) => c.querySelector("[data-slot=match-art]") !== null && c.querySelector("[data-slot=match-art] img") === null)).toBe(true);
  });

  it("league's battle logs (#786, #834): the shield, attacks and defences as cards, newest first, each opening its match", async () => {
    const onOpenMatch = vi.fn();
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.yeoman} onOpenMatch={onOpenMatch} />));
    expect(screen.getByRole("heading", { level: 2, name: "Battle logs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Defence log" })).toBeNull();
    expect(screen.getByRole("region", { name: "Shield" })).toHaveAttribute("data-shield", "on");
    expect(screen.getByRole("timer")).toHaveAccessibleName("Shielded, 5 hours 12 minutes left");
    expect(screen.getByRole("timer")).toHaveTextContent("05h12m");
    const cards = within(screen.getByRole("list", { name: "Matches" })).getAllByRole("button");
    expect(cards).toHaveLength(MATCHES.length);
    // Attacks and defences mixed, newest first, each told apart.
    expect(cards.map((c) => c.dataset.side)).toEqual(MATCHES.map((m) => m.side));
    expect(cards[0]).toHaveAccessibleName(`Your attack on ${RIVAL.name}: ${MATCHES[0]!.stars} of 3 stars`);
    expect(cards[1]).toHaveAccessibleName(`Vael's attack on your village: ${MATCHES[1]!.stars} of 3 stars`);
    // A card (#834): its side's background behind (#857: the build's render, at each of its widths), no plan view; the other
    // player, the stars, the score alone, the crowns, an attack's XP and chest, the time in its largest unit.
    expect(cards[0]!.querySelector("[inert]")).toBeNull();
    const art = (card: HTMLElement) => card.querySelector("[data-slot=match-art] img");
    expect(art(cards[0]!)).toHaveAttribute("srcset", expect.stringMatching(/battle-attack-720\.0\.\w+\.webp 720w, .*battle-attack-1040\.0\.\w+\.webp 1040w, .*battle-attack-2000\.0\.\w+\.webp 2000w$/));
    expect(art(cards[1]!)).toHaveAttribute("src", expect.stringMatching(/battle-defence-2000\.0\.\w+\.webp$/));
    expect(within(cards[0]!).getByText("Attack")).toBeInTheDocument();
    expect(within(cards[0]!).getByRole("img", { name: `${MATCHES[0]!.stars} of 3 stars` })).toBeInTheDocument();
    expect(within(cards[0]!).getByRole("img", { name: `+${MATCHES[0]!.crowns} crowns` })).toBeInTheDocument();
    expect(within(cards[0]!).getByTestId("match-score")).toHaveTextContent(/^[\d,]+$/);
    expect(within(cards[0]!).queryByText(/ \/ /)).toBeNull();
    expect(within(cards[0]!).getByText("40min ago")).toBeInTheDocument();
    expect(within(cards[1]!).getByText("2h ago")).toBeInTheDocument();
    expect(within(cards[0]!).getByTestId("match-xp")).toHaveTextContent(`+${MATCHES[0]!.xp} XP`);
    expect(within(cards[0]!).getByTestId("match-rewards")).toHaveTextContent("Silver chest");
    expect(within(cards[1]!).getByText("Defence")).toBeInTheDocument();
    expect(within(cards[1]!).getByRole("img", { name: `${MATCHES[1]!.crowns} crowns` })).toBeInTheDocument();
    expect(within(cards[1]!).queryByTestId("match-xp")).toBeNull();
    expect(within(cards[1]!).queryByTestId("match-rewards")).toBeNull();
    // In colour when crowns were won (or a draw), in grayscale when they were lost.
    expect(cards.map((c) => c.dataset.lost)).toEqual(MATCHES.map((m) => String(m.crowns < 0)));
    for (const c of cards) expect(c.querySelector("[data-slot=match-art]")!.classList.contains("grayscale")).toBe(c.dataset.lost === "true");
    // Every card one height (open point 3), 112 px (#857).
    expect(new Set(cards.map((c) => c.className.match(/\bh-\S+/)?.[0]))).toEqual(new Set(["h-28"]));
    await userEvent.click(cards[1]!);
    expect(onOpenMatch).toHaveBeenCalledWith(MATCHES[1]!.id);
    cleanup();
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.matchesEmpty} />));
    expect(screen.getByText(/No match yet/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Shield" })).toHaveAttribute("data-shield", "off");
  });

  it("league's matches: the latest 20, then 20 more with Show more (open point 3); v1's cards have no rewards", async () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.matchesMany} />));
    const list = () => within(screen.getByRole("list", { name: "Matches" })).getAllByRole("button");
    expect(list()).toHaveLength(20);
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(list()).toHaveLength(26);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    cleanup();
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.matchesNoSnapshot} />));
    expect(list().every((c) => c.querySelector("[data-slot=match-art]") !== null)).toBe(true);
    expect(screen.queryByTestId("match-rewards")).toBeNull();
    expect(screen.queryByTestId("match-xp")).toBeNull();
  });

  it("league: crowns, the way to the next league, the season's end", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.yeoman} />));
    expect(screen.getByRole("progressbar", { name: "28 crowns to Yeoman I" })).toBeInTheDocument();
    expect(screen.getByText(/Ends in 4 d 3 h/)).toBeInTheDocument();
    expect(screen.getByRole("group", { current: true })).toHaveAccessibleName("Yeoman II");
    cleanup();
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.wanderer} />));
    expect(screen.getByRole("heading", { name: "Wanderer" })).toBeInTheDocument();
    cleanup();
    // An open attack holds 20 crowns: the chain says Peasant III (the whole count, 400) while showing 380.
    render(wrap(<PvpLeagueScene crowns={380} league={1} season={PVP_LEAGUE.yeoman.season} now={PVP_LEAGUE.yeoman.now} />));
    expect(screen.queryByRole("heading", { name: "Wanderer" })).toBeNull();
    expect(screen.getAllByText("Peasant III").length).toBeGreaterThan(0);
    expect(screen.getByRole("group", { current: true })).toHaveAccessibleName("Peasant III");
    // Held crowns under the floor start the bar empty, never below it.
    expect((screen.getByRole("progressbar").firstElementChild as HTMLElement).style.transform).toBe("translateX(-100%)");
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
