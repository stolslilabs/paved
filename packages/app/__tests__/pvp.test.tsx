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
import { PvpDefenceScene } from "../src/components/scenes/pvp-defence-scene";
import { PvpLeagueScene } from "../src/components/scenes/pvp-league-scene";
import { PvpResultScene } from "../src/components/scenes/pvp-result-scene";
import { PvpScoutScene } from "../src/components/scenes/pvp-scout-scene";
import { PvpSearchScene } from "../src/components/scenes/pvp-search-scene";
import {
  ATTACK_SCORES,
  ATTACK_STEPS,
  MY_VILLAGE,
  PVP_ATTACK,
  PVP_DEFENCE,
  PVP_LEAGUE,
  PVP_REPLAY,
  PVP_RESULT,
  PVP_SCOUT,
  PVP_SEARCH,
  RIVAL_VILLAGE,
  STAKES,
} from "../src/mocks/pvp";
import { playAttack } from "../src/mocks/pvp-attack";

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
    expect([0, 1, 2, 3].map((s) => crownsFor(STAKES, s))).toEqual([-18, 10, 20, 30]);
  });

  it("puts every crown count in one league, the last open-ended", () => {
    expect(leagueOf(0).id).toBe("bronze");
    expect(leagueOf(1_199).id).toBe("gold");
    expect(leagueOf(1_200).id).toBe("crystal");
    expect(leagueOf(99_999).id).toBe("legend");
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

  it("scout: the village's score, each star's points and crowns, the loss, Next's price", async () => {
    const onNext = vi.fn();
    const onAttack = vi.fn();
    render(wrap(<PvpScoutScene {...PVP_SCOUT.ready} onNext={onNext} onAttack={onAttack} />));
    expect(screen.getByText("5,831")).toBeInTheDocument();
    const stars = within(screen.getByRole("list", { name: "Stars" })).getAllByRole("listitem");
    expect(stars.map((s) => s.textContent)).toEqual(["4,082+10", "4,957+20", "6,415+30"]);
    expect(screen.getByRole("img", { name: "-18 crowns" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Board of 38 tiles in a territory of 38 cells/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next village for 10 Cobbles" }));
    await userEvent.click(screen.getByRole("button", { name: /Attack/ }));
    expect(onNext).toHaveBeenCalled();
    expect(onAttack).toHaveBeenCalled();
  });

  it("scout: warns that attacking drops the shield, and disables Next without the Cobbles", () => {
    const { container } = render(wrap(<PvpScoutScene {...PVP_SCOUT.shielded} />));
    expect(screen.getByText("Attacking drops your shield")).toBeInTheDocument();
    // On a phone the board takes the space left above the card, in the same column: the card never covers it.
    const board = container.querySelector("[data-scout-board]")!;
    const card = screen.getByRole("region", { name: "Attack" });
    expect(board.parentElement).toBe(card.parentElement);
    expect(card.className).not.toMatch(/(^|\s)absolute\b/);
    cleanup();
    render(wrap(<PvpScoutScene {...PVP_SCOUT.short} />));
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
    await userEvent.click(within(dialog).getByRole("button", { name: "Take 15 Cobbles instead" }));
    expect(onTakeCobbles).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Village reward" })).toBeNull());
  });

  it("result: the reward taken, a tile or the Cobbles", () => {
    render(wrap(<PvpResultScene {...PVP_RESULT.rewardPlaced} />));
    expect(screen.getByText("Placed in your village.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Choose/ })).toBeNull();
    cleanup();
    render(wrap(<PvpResultScene {...PVP_RESULT.rewardCobbles} />));
    expect(screen.getByRole("img", { name: "+15 Cobbles" })).toBeInTheDocument();
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

  it("defence log: the shield's timer, the attacks and their replays", async () => {
    const onReplay = vi.fn();
    render(wrap(<PvpDefenceScene {...PVP_DEFENCE.shielded} onReplay={onReplay} />));
    expect(screen.getByRole("region", { name: "Shield" })).toHaveAttribute("data-shield", "on");
    expect(screen.getByRole("timer")).toHaveAccessibleName("Shield ends in 5:12:00");
    expect(within(screen.getByRole("list", { name: "Attacks" })).getAllByRole("listitem")).toHaveLength(5);
    await userEvent.click(screen.getByRole("button", { name: "Replay the attack of Vael" }));
    expect(onReplay).toHaveBeenCalledWith(41);
    cleanup();
    render(wrap(<PvpDefenceScene {...PVP_DEFENCE.empty} />));
    expect(screen.getByText("No attack on your village yet.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Shield" })).toHaveAttribute("data-shield", "off");
  });

  it("league: crowns, the way to the next league, the season's end", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.gold} />));
    expect(screen.getByRole("progressbar", { name: "28 crowns to Crystal" })).toBeInTheDocument();
    expect(screen.getByText(/Ends in 4 d 3 h/)).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: true })).toHaveTextContent("Gold");
    cleanup();
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.unranked} />));
    expect(screen.getByRole("heading", { name: "Unranked" })).toBeInTheDocument();
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
    ["pvp-defence-scene.stories.tsx", PVP_DEFENCE],
    ["pvp-league-scene.stories.tsx", PVP_LEAGUE],
  ])("%s has a story per state", (file, fixtures) => {
    const text = readFileSync(join(scenes, file), "utf8");
    for (const key of Object.keys(fixtures)) expect(text).toMatch(new RegExp(`\\.${key}\\b`));
    expect(exportsOf(file).length).toBeGreaterThanOrEqual(Object.keys(fixtures).length);
  });
});
