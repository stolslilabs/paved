import { render, screen, within } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterAll, describe, expect, it } from "vitest";
import { capScore, winningScore } from "@paved/game-core";
import { GameHud } from "../src/components/containers/game-hud";
import { ScoreMeter } from "../src/components/elements/score-meter";
import { BoardScene } from "../src/components/scenes/board-scene";
import { PvpAttackScene } from "../src/components/scenes/pvp-attack-scene";
import { attackMeter, challengeMeter, storyMeter, trainingMeter } from "../src/lib/score-meter";
import { trainingBestBefore, TRAINING_BEST_KEY } from "../src/data/training-best";
import { CURVE_PLAYING } from "../src/mocks/games";
import { PVP_ATTACK } from "../src/mocks/pvp";
import { BOARD, TRAINING_BEST } from "../src/mocks/scenes";
import { storyStarFills } from "../src/routes/pages/story-board";
import { slow } from "../test-slow";
import { settleBoardChunks } from "./lazy-chunks";

// The scene's lazy chunks loaded before the environment goes (`lazy-chunks.ts`).
afterAll(settleBoardChunks, slow(30_000));

// GAME-OVERLAY (the owner's ask of 2026-11-08: "une barre de progression comme dans les game en Ranked", restyled, in every mode).
const wrap = (ui: ReactNode, reduced = false) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>{ui}</MotionConfig>
  </LazyMotion>
);
const marks = (meter: HTMLElement) => [...meter.querySelectorAll<HTMLElement>("[data-reached]")];
const fill = (meter: HTMLElement) => Number(meter.querySelector("[data-fill]")!.getAttribute("data-fill"));

describe("the score meter under the header, every mode", () => {
  it("the Attack: the Ranked's marks and share, on the HUD's frame under the header", () => {
    render(wrap(<PvpAttackScene {...PVP_ATTACK.midway} />));
    const meter = screen.getByRole("meter", { name: /of the target/ });
    expect(meter.closest("[data-slot=score-meter]")).not.toBeNull();
    const value = attackMeter(PVP_ATTACK.midway.score, PVP_ATTACK.midway.target, PVP_ATTACK.midway.starPercents);
    expect(meter).toHaveTextContent(value.figure!);
    // In even steps (the Missions' rail), each star filled from the mark before: the true share is the figure.
    expect(marks(meter).map((m) => [m.getAttribute("data-art"), Math.round(parseFloat(m.style.left))])).toEqual([
      ["star", 33],
      ["star", 67],
      ["star", 100],
    ]);
    expect(fill(meter)).toBe(Math.round(value.fill * 100));
  });

  it("Story: its stars by their shares, no figure and no threshold anywhere (#593)", () => {
    const result = { stars: 2 as const, twoStars: 800, target: 1200 };
    render(wrap(<BoardScene {...BOARD.training} mode="story" title="Tutorial 5: Under the trees" score={1000} meter={storyMeter(result.stars, storyStarFills(result, 1000))} />));
    const meter = screen.getByRole("meter", { name: "2 of 3 stars so far" });
    expect(meter).toHaveAttribute("data-stars", "2");
    // The first star at the start (finishing holds it), the second at the middle, the third at the end: where they stand says nothing of a score.
    expect(marks(meter).map((m) => m.style.left)).toEqual(["0%", "50%", "100%"]);
    expect(marks(meter).map((m) => m.getAttribute("data-reached"))).toEqual(["true", "true", "false"]);
    // The second half filled by the third star's share: (1,000 - 800) / (1,200 - 800).
    expect(fill(meter)).toBe(75);
    expect(meter).toHaveTextContent("");
    expect(document.body).not.toHaveTextContent(/1,200|800/);
  });

  it("a Challenge: the trophy at the score to beat, then the PAVED coin at the cap", () => {
    const least = winningScore(CURVE_PLAYING.threshold);
    const cap = capScore(CURVE_PLAYING.threshold, CURVE_PLAYING.slopeBps, CURVE_PLAYING.cap);
    render(wrap(<BoardScene {...BOARD.belowThreshold} meter={challengeMeter(CURVE_PLAYING, 640)} />));
    const meter = screen.getByRole("meter", { name: /of the score to beat/ });
    expect(marks(meter).map((m) => [m.getAttribute("data-art"), m.style.left, m.getAttribute("data-reached")])).toEqual([
      ["trophy", "50%", "false"],
      ["paved", "100%", "false"],
    ]);
    expect(fill(meter)).toBe(Math.round((640 / least / 2) * 100));
    expect(meter).toHaveTextContent(`${Math.round((640 / least) * 100)}%`);
    // Past the score to beat: the trophy lit, the second half on toward the cap.
    const past = challengeMeter(CURVE_PLAYING, least + (cap - least) / 2);
    expect(past.marks.map((m) => m.reached)).toEqual([true, false]);
    expect(past.fill).toBeCloseTo(0.75);
  });

  it("a Challenge past its cap: aria-valuenow held within its range, the true share in its words and its figure", () => {
    const cap = capScore(CURVE_PLAYING.threshold, CURVE_PLAYING.slopeBps, CURVE_PLAYING.cap);
    const value = challengeMeter(CURVE_PLAYING, cap * 2);
    expect(value.now).toBeGreaterThan(value.max);
    render(wrap(<ScoreMeter {...value} />));
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuemax", String(value.max));
    expect(meter).toHaveAttribute("aria-valuenow", String(value.max));
    expect(meter).toHaveAttribute("aria-valuetext", `${value.now}%, beaten`);
    expect(meter).toHaveTextContent(`${value.now}%`);
    expect(fill(meter)).toBe(100);
  });

  it("Training: the crown at the device's best, lit by a new best; none on the device's first game", () => {
    const { unmount } = render(wrap(<BoardScene {...BOARD.training} />));
    const meter = screen.getByRole("meter", { name: /of your best/ });
    expect(marks(meter).map((m) => [m.getAttribute("data-art"), m.style.left])).toEqual([["crown", "100%"]]);
    expect(meter).toHaveAttribute("aria-valuemax", "100");
    unmount();
    expect(trainingMeter(TRAINING_BEST, TRAINING_BEST)!.marks[0]!.reached).toBe(false);
    expect(trainingMeter(TRAINING_BEST, TRAINING_BEST + 1)!.valueText).toMatch(/a new best/);
    expect(trainingMeter(null, 500)).toBeNull();
    render(wrap(<BoardScene {...BOARD.training} meter={null} />));
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("Training's best: the device's, or the one before this game when it set it; nothing on the first game", () => {
    const store = new Map<string, string>();
    const kv = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    expect(trainingBestBefore(() => kv, "0x1")).toBeNull();
    store.set(TRAINING_BEST_KEY, JSON.stringify({ score: 1500, seed: "0x2", previous: 1200 }));
    expect(trainingBestBefore(() => kv, "0x1")).toBe(1500);
    expect(trainingBestBefore(() => kv, "0x2")).toBe(1200);
    expect(trainingBestBefore(() => null, "0x1")).toBeNull();
  });

  it("the HUD keeps its single painted star by the score", () => {
    render(wrap(<GameHud title="Training" score={900} now={0} />));
    expect(within(screen.getByRole("banner")).queryByRole("meter")).toBeNull();
    expect(within(screen.getByRole("banner")).queryByRole("img", { name: /stars/ })).toBeNull();
  });
});

describe("a mark reached in play", () => {
  const at = (score: number) => storyMeter(score >= 1200 ? 3 : score >= 800 ? 2 : 1, storyStarFills({ twoStars: 800, target: 1200 }, score));

  it("beats once (its light flashes); one held from the start does not", () => {
    const { rerender } = render(wrap(<ScoreMeter {...at(900)} />));
    expect(document.querySelector("[data-part=mark-flash]")).toBeNull();
    rerender(wrap(<ScoreMeter {...at(1250)} />));
    expect(document.querySelectorAll("[data-part=mark-flash]")).toHaveLength(1);
    expect(screen.getByRole("meter")).toHaveAttribute("data-stars", "3");
  });

  it("a move reaching two marks beats both", () => {
    const { rerender } = render(wrap(<ScoreMeter {...storyMeter(1, [1, 0.9, 0])} />));
    rerender(wrap(<ScoreMeter {...storyMeter(3, [1, 1, 1])} />));
    expect(screen.getByRole("meter")).toHaveAttribute("data-stars", "3");
    const flashed = marks(screen.getByRole("meter")).map((m) => m.querySelector("[data-part=mark-flash]") !== null);
    expect(flashed).toEqual([false, true, true]);
  });

  it("nothing beats under reduced motion, and the gold moves at once", () => {
    const { rerender } = render(wrap(<ScoreMeter {...at(900)} />, true));
    rerender(wrap(<ScoreMeter {...at(1250)} />, true));
    expect(document.querySelector("[data-part=mark-flash]")).toBeNull();
    expect(screen.getByRole("meter").querySelector<HTMLElement>("[data-fill]")!.style.transition).toBe("none");
  });
});
