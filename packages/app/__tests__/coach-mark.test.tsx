import { render, screen, within } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterAll, describe, expect, it, vi } from "vitest";
import { CAMPAIGNS } from "@paved/game-core";
import type { CoachTarget } from "../src/components/containers/coach";
import { TileBubble } from "../src/components/containers/tile-bubble";
import { BoardScene } from "../src/components/scenes/board-scene";
import { BOARD } from "../src/mocks/scenes";
import { COACH } from "../src/routes/pages/story-board";
import { slow } from "../test-slow";
import { settleBoardChunks } from "./lazy-chunks";

// The scene's lazy chunks loaded before the environment goes (`lazy-chunks.ts`).
afterAll(settleBoardChunks, slow(30_000));

// GAME-OVERLAY (the owner's words of 2026-11-07: "un genre de wireframe autour du deck en jaune qui pulse"): one coach mark, the opened
// chest's light behind the control a Story tip names, on every target; no outline, no ring, no CSS pulse.
const wrap = (ui: ReactNode, reduced = false) => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>{ui}</MotionConfig>
  </LazyMotion>
);
const marks = () => document.querySelectorAll("[data-coach-mark]");

/** The coached control's box and the mark in it: one mark on the board, inside the box that names the target. */
function markOf(target: string): HTMLElement {
  expect(marks()).toHaveLength(1);
  const box = document.querySelector<HTMLElement>(`[data-coach="${target}"]`)!;
  expect(box).not.toBeNull();
  expect(box.className).toMatch(/\bisolate\b/);
  const mark = box.querySelector<HTMLElement>("[data-coach-mark]")!;
  expect(mark).not.toBeNull();
  // Behind the control, out of the accessibility tree and of the pointer's way.
  expect(mark).toHaveAttribute("aria-hidden", "true");
  expect(mark.className).toMatch(/-z-10/);
  expect(mark.className).toMatch(/pointer-events-none/);
  return mark;
}

/** Nothing pulses on the board and no wireframe follows the stack (the yellow outline is gone). */
function noOldMarks(container: HTMLElement) {
  expect(container.querySelector(".animate-pulse")).toBeNull();
  expect(container.querySelector("[class*='ring-primary']")).toBeNull();
  const stack = screen.queryByTestId("tile-stack");
  // The pile's own drawing has polygons (its layers); none is an outline of the stack (stroked, unfilled).
  for (const p of stack?.querySelectorAll("polygon") ?? []) expect(p.getAttribute("fill")).not.toBe("none");
}

describe("the coach mark (GAME-OVERLAY)", () => {
  it.each([
    ["deck", "tile-stack"],
    ["discard", "stack's trash"],
    ["settings", "gear"],
  ] as const)("%s: the light behind the %s, nothing else coached", (target) => {
    const { container } = render(wrap(<BoardScene {...BOARD.training} mode="story" onDiscard={vi.fn()} coach={target as CoachTarget} />));
    const mark = markOf(target);
    // The painted rays (the opened chest's, white so the code tints them), two fans, the glow, the waves and the flash.
    expect(mark.querySelectorAll("[data-part=rays]")).toHaveLength(2);
    expect((mark.querySelector("[data-part=rays]") as HTMLElement).style.maskImage).toMatch(/\/chest-art\/fx\/rays\/\d+\.webp/);
    expect(mark.querySelector("[data-part=glow]")).not.toBeNull();
    expect(mark.querySelectorAll("[data-part=wave]")).toHaveLength(2);
    expect(mark.querySelector("[data-part=flash]")).not.toBeNull();
    noOldMarks(container);
  });

  it("the deck's light comes out of the pile, not the stack's box", () => {
    render(wrap(<BoardScene {...BOARD.training} mode="story" coach="deck" />));
    const mark = markOf("deck");
    expect(screen.getByTestId("tile-stack")).toHaveAttribute("data-coach", "deck");
    // Centred on the pile's top (the tiles in hand and coming hover above it), not on the box's middle; wider than the box.
    expect(mark.style.top).not.toBe("50%");
    expect(parseFloat(mark.style.width)).toBeGreaterThan(100);
  });

  it.each([
    ["place", "Hold to place the tile", "top-right"],
    ["discard", "Hold to discard the tile (free)", "bottom-right"],
  ] as const)("%s on the tile: the light behind its action", (coach, name, side) => {
    const { container } = render(wrap(<TileBubble rotations={2} onRotate={vi.fn()} onClose={vi.fn()} onDiscard={vi.fn()} onConfirm={vi.fn()} coach={coach} />));
    const mark = markOf(coach);
    expect(mark.closest("[data-side]")).toHaveAttribute("data-side", side);
    expect(within(mark.closest("[data-side]") as HTMLElement).getByRole("button", { name })).toBeInTheDocument();
    noOldMarks(container);
  });

  it("under reduced motion: the two fans and the glow, still; no waves, no flash", () => {
    render(wrap(<BoardScene {...BOARD.training} mode="story" coach="settings" />, true));
    const mark = markOf("settings");
    expect(mark.querySelectorAll("[data-part=rays]")).toHaveLength(2);
    expect(mark.querySelector("[data-part=glow]")).not.toBeNull();
    expect(mark.querySelector("[data-part=wave]")).toBeNull();
    expect(mark.querySelector("[data-part=flash]")).toBeNull();
  });

  it("no target, no mark: a level that introduces no control shows none", () => {
    const { container } = render(wrap(<BoardScene {...BOARD.training} mode="story" coach={null} />));
    expect(marks()).toHaveLength(0);
    expect(container.querySelector("[data-coach]")).toBeNull();
    noOldMarks(container);
  });

  it("every Story level: the coached ones name one of the four targets, every other level none", () => {
    const targets = new Set<CoachTarget | null>(["place", "discard", "deck", "settings", null]);
    for (const [key, entry] of Object.entries(COACH)) {
      const [campaign, level] = key.split("-").map(Number);
      expect(CAMPAIGNS.find((c) => c.id === campaign)?.levels.some((l) => l.id === level), key).toBe(true);
      expect(targets.has(entry.target), key).toBe(true);
    }
    // The deck's mark (the old yellow outline) on the Tutorial's 5 and 11 only.
    expect(Object.entries(COACH).filter(([, e]) => e.target === "deck").map(([k]) => k)).toEqual(["1-5", "1-11"]);
    // Tutorial 6 introduced the board's dial (SEASONS-SETTINGS: gone): no coach of its own, its intro's tip alone.
    expect(COACH["1-6"]).toBeUndefined();
    expect(Object.values(COACH).some((e) => /wheel/i.test(e.tip))).toBe(false);
  });
});
