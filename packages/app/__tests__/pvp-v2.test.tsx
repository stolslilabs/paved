import { cleanup, render, screen, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CENTER } from "@paved/game-core";
import { attackDeck } from "@paved/game-core";
import { ATTACK_DECK_PERCENT, ATTACK_STAR_PERCENTS, ATTACK_VIEW, attackDeckSize, attackExtras, attackStarPoints, attackStars } from "../src/lib/pvp-v2-rules";
import { StarMeter } from "../src/components/elements/star-meter";
import { PvpAttackScene } from "../src/components/scenes/pvp-attack-scene";
import { PvpScoutScene } from "../src/components/scenes/pvp-scout-scene";
import { PVP_V2_ATTACK, PVP_V2_SCOUT, RIVAL_V2_SLOTS, RIVAL_V2_VILLAGE, V2_ATTACK_STEPS, V2_DECK, V2_DECK_SIZE, V2_MIDWAY } from "../src/mocks/pvp-v2";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

afterEach(cleanup);

describe("PvP v2 attack rules (#740, owner decisions of 2026-10-24): game-core's (#741)", () => {
  it("sizes the deck at ceil(1.15 x S), in integers", () => {
    expect(ATTACK_DECK_PERCENT).toBe(115);
    expect([9, 10, 20, 28].map(attackDeckSize)).toEqual([11, 12, 23, 33]);
    expect(attackExtras(20, 20)).toBe(3);
    expect(attackExtras(12, 20)).toBe(11);
  });

  it("shows three tiles and puts the stars at 80 / 90 / 100 %", () => {
    expect(ATTACK_VIEW).toBe(3);
    expect(ATTACK_STAR_PERCENTS).toEqual([80, 90, 100]);
    expect(attackStarPoints(3_635)).toEqual([2_908, 3_272, 3_635]);
    expect([0, 2_907, 2_908, 3_271, 3_272, 3_634, 3_635, 9_000].map((s) => attackStars(s, 3_635))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe("PvP v2 fakes, played on the engine", () => {
  it("fills the rival's 20 slots (the starter's included) and deals game-core's deck of 23: its 19 tiles and 4 extras", () => {
    expect(RIVAL_V2_SLOTS).toBe(20);
    expect(RIVAL_V2_VILLAGE.tiles).toHaveLength(20);
    expect(V2_DECK).toEqual(attackDeck(RIVAL_V2_VILLAGE.tiles.filter((t) => t.x !== CENTER || t.y !== CENTER).map((t) => t.plan), 20, 10n));
    expect(V2_DECK).toHaveLength(V2_DECK_SIZE);
    expect(V2_DECK_SIZE).toBe(23);
    const count = (plans: readonly number[]) => plans.reduce((m, p) => m.set(p, (m.get(p) ?? 0) + 1), new Map<number, number>());
    const deck = count(V2_DECK);
    // Every placed tile but the starter is in the deck.
    for (const [plan, n] of count(RIVAL_V2_VILLAGE.tiles.filter((t) => t.x !== CENTER || t.y !== CENTER).map((t) => t.plan))) expect(deck.get(plan) ?? 0).toBeGreaterThanOrEqual(n);
  });

  it("plays the deck in its order on an unbounded board: tiles off the village's cells, every tile drawn", () => {
    expect(V2_ATTACK_STEPS).toHaveLength(V2_DECK_SIZE + 1);
    expect(V2_ATTACK_STEPS.slice(0, -1).map((s) => s.hand!.plan)).toEqual(V2_DECK);
    expect(V2_ATTACK_STEPS.map((s) => s.remaining)).toEqual(Array.from({ length: V2_DECK_SIZE + 1 }, (_, i) => V2_DECK_SIZE - i));
    const cells = new Set(RIVAL_V2_VILLAGE.cells.map((c) => `${c.x},${c.y}`));
    expect(V2_ATTACK_STEPS.at(-1)!.tiles.some((t) => !cells.has(`${t.x},${t.y}`))).toBe(true);
  });
});

describe("PvP v2 scenes (#740)", () => {
  it("attack: no territory, the meter's marks at 80 / 90 / 100 %, the deck as the tiles left", () => {
    render(wrap(<PvpAttackScene {...PVP_V2_ATTACK.start} />));
    const board = screen.getByRole("group", { name: /^Board of 1 tiles$/ });
    expect(board.querySelectorAll("[data-territory]")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^Tiles left/ })).toHaveTextContent(String(V2_DECK_SIZE));
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuemax", "115");
    const marks = [...meter.querySelectorAll<HTMLElement>("[data-reached]")].map((m) => parseFloat(m.style.left));
    expect(marks.map((m) => Math.round(m * 1.15))).toEqual([80, 90, 100]);
  });

  it("attack: the tile in hand and the next two of the deck, fewer at its end", () => {
    render(wrap(<PvpAttackScene {...PVP_V2_ATTACK.midway} />));
    expect(PVP_V2_ATTACK.midway.hand.tile!.plan).toBe(V2_DECK[V2_MIDWAY]);
    expect(PVP_V2_ATTACK.midway.hand.coming!.map((t) => t.plan)).toEqual(V2_DECK.slice(V2_MIDWAY + 1, V2_MIDWAY + 3));
    expect(screen.getByTestId("coming-tiles").querySelectorAll("li")).toHaveLength(2);
    cleanup();
    render(wrap(<PvpAttackScene {...PVP_V2_ATTACK.twoLeft} />));
    expect(screen.getByTestId("coming-tiles").querySelectorAll("li")).toHaveLength(1);
    cleanup();
    render(wrap(<PvpAttackScene {...PVP_V2_ATTACK.lastTile} />));
    expect(screen.queryByTestId("coming-tiles")).toBeNull();
  });

  it("attack: lights the stars at 80, 90 and 100 % of the village", () => {
    for (const [state, stars] of [
      [PVP_V2_ATTACK.start, 0],
      [PVP_V2_ATTACK.oneStar, 1],
      [PVP_V2_ATTACK.twoStars, 2],
      [PVP_V2_ATTACK.end, 3],
    ] as const) {
      render(wrap(<PvpAttackScene {...state} />));
      expect(screen.getByRole("meter")).toHaveAttribute("data-stars", String(stars));
      cleanup();
    }
  });

  it("star meter: v1's marks stay where they were without `percents`", () => {
    render(<StarMeter score={5_300} target={5_831} />);
    expect(screen.getByRole("meter")).toHaveAttribute("data-stars", "2");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuemax", "125");
    cleanup();
    render(<StarMeter score={5_300} target={5_831} percents={ATTACK_STAR_PERCENTS} />);
    expect(screen.getByRole("meter")).toHaveAttribute("data-stars", "2");
  });

  it("scout: the village, its score, each star's points at 80 / 90 / 100 % and the deck the attack will have", () => {
    render(wrap(<PvpScoutScene {...PVP_V2_SCOUT.ready} />));
    expect(screen.getByText("Village score").nextSibling).toHaveTextContent("3,216");
    const stars = within(screen.getByRole("list", { name: "Stars" })).getAllByRole("listitem");
    expect(stars.map((s) => s.textContent)).toEqual(["2,573+10", "2,895+20", "3,216+30"]);
    expect(screen.getByRole("img", { name: /^Board of 20 tiles$/ })).toBeInTheDocument();
    const region = screen.getByRole("region", { name: "Attack" });
    expect(region.querySelector("[data-deck]")).toHaveTextContent("23 tiles to play20 slots, on an open board");
    expect(region).toHaveTextContent("You play the village's 19 tiles and 4 from the base deck, shuffled. You see the tile in hand and the next two.");
    cleanup();
    render(wrap(<PvpScoutScene {...PVP_V2_SCOUT.small} />));
    expect(screen.getByRole("region", { name: "Attack" }).querySelector("[data-deck]")).toHaveTextContent("11 tiles to play9 slots");
  });
});

describe("PvP v2 stories", () => {
  const scenes = join(__dirname, "../src/components/scenes");
  it.each([
    ["pvp-attack-v2.stories.tsx", PVP_V2_ATTACK],
    ["pvp-scout-v2.stories.tsx", PVP_V2_SCOUT],
  ])("%s has a story per state", (file, fixtures) => {
    const text = readFileSync(join(scenes, file), "utf8");
    for (const key of Object.keys(fixtures)) expect(text).toMatch(new RegExp(`\\.${key}\\b`));
  });
});
