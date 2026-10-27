import { slow } from "../test-slow";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byCategory, formatInteger } from "@paved/game-core";
import { layoutPoints } from "../src/components/containers/layout-rules";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { HOME_VILLAGE } from "../src/mocks/village-v2";
import { resetScoreOpenForTests, scoreOpenStored, storeScoreOpen } from "../src/routes/score-open";

// V3-SCORE-ACCORDION (#831): the home's village score is an inline accordion under the profile: folded, the total; unfolded,
// the total and the four kinds' sums under it, in place. No panel, no light on the scene.

const wrap = (ui: ReactNode, reducedMotion: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reducedMotion}>{ui}</MotionConfig>
  </LazyMotion>
);
afterEach(cleanup);

const total = () => screen.getByRole("button", { name: /^Village score / });
/** The kinds' list, its own chunk, in. */
const kinds = () => screen.findByRole("list", { name: "Score by kind" }, { timeout: slow(5000) });
/** The rows as read: each kind's name and its sum. */
const rows = (list: HTMLElement) =>
  within(list)
    .getAllByRole("listitem")
    .map((li) => ({ kind: li.querySelector(".flex-1")!.textContent, points: Number(li.querySelector(".numeric")!.textContent!.replace(/,/g, "")) }));

describe("the home's village score (#831)", () => {
  it("is folded by default: the total alone; a tap unfolds the four kinds, another folds them", async () => {
    const onScoreOpenChange = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onScoreOpenChange={onScoreOpenChange} />));
    const button = total();
    expect(button).toHaveAccessibleName(`Village score ${formatInteger(HOME_VILLAGE.view.village.score)}`);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("list", { name: "Score by kind" })).toBeNull();
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const list = await kinds();
    expect(button.getAttribute("aria-controls")).toBe("village-score-kinds");
    expect(document.getElementById("village-score-kinds")!.contains(list)).toBe(true);
    expect(rows(list).map((r) => r.kind).sort()).toEqual(["Cities", "Forests", "Roads", "Wonders"]);
    expect(onScoreOpenChange).toHaveBeenLastCalledWith(true);
    // Nothing opens over the scene.
    expect(screen.queryByRole("region", { name: "Village points" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(screen.queryByRole("list", { name: "Score by kind" })).toBeNull(), { timeout: slow(2000) });
    expect(onScoreOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("adds the kinds up to the total, the most points first", async () => {
    for (const state of [HOME_VILLAGE.scoreOpen, HOME_VILLAGE.scoreWonder, HOME_VILLAGE.scoreKindZero]) {
      const { unmount } = render(wrap(<HomeVillageScene {...state} />));
      const shown = rows(await kinds());
      expect(shown.reduce((sum, r) => sum + r.points, 0)).toBe(state.village.score);
      expect(shown.map((r) => r.points)).toEqual([...shown.map((r) => r.points)].sort((a, b) => b - a));
      expect(shown.map((r) => r.points)).toEqual(byCategory(layoutPoints(state.village.tiles)).map((s) => s.points));
      unmount();
    }
  });

  it("shows 0 for a kind with no structure, last", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.scoreKindZero} />));
    const shown = rows(await kinds());
    expect(shown).toHaveLength(4);
    expect(shown.at(-1)).toEqual({ kind: "Wonders", points: 0 });
  });

  it("every kind scores around a closed Wonder", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.scoreWonder} />));
    expect(rows(await kinds()).find((r) => r.kind === "Wonders")!.points).toBeGreaterThan(0);
  });

  it("keeps its fold across edit mode", async () => {
    const { rerender } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.scoreOpen} />));
    await kinds();
    rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.scoreOpen} editing />));
    expect(screen.queryByRole("button", { name: /^Village score / })).toBeNull();
    rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.scoreOpen} editing={false} />));
    expect(total()).toHaveAttribute("aria-expanded", "true");
    await kinds();
  });

  it("after a save, the total counts to the new score (#802) and the kinds are the new layout's", async () => {
    const { score } = HOME_VILLAGE.scoreOpenSaved.saved;
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.scoreOpenSaved} />));
    const button = screen.getByRole("button", { name: `Village score ${formatInteger(score)}` });
    await waitFor(() => expect(button.querySelector("[data-slot=score-count] [data-slot=resource-change]")).not.toBeNull(), { timeout: slow(5000) });
    expect(rows(await kinds()).reduce((sum, r) => sum + r.points, 0)).toBe(score);
  });

  it("under reduced motion, unfolds at once: no height animation, no turning chevron", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} />, "always"));
    const button = total();
    expect(button.querySelector(".transition-transform")).toBeNull();
    await userEvent.click(button);
    const list = await kinds();
    await waitFor(() => expect(document.getElementById("village-score-kinds")!.style.height).not.toBe("0px"));
    expect(list).toBeVisible();
  });
});

describe("the village score's fold kept on the device (#831, open point 2)", () => {
  afterEach(() => {
    resetScoreOpenForTests();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("is folded by default, and keeps the last choice", () => {
    expect(scoreOpenStored()).toBe(false);
    storeScoreOpen(true);
    resetScoreOpenForTests();
    expect(scoreOpenStored()).toBe(true);
    storeScoreOpen(false);
    resetScoreOpenForTests();
    expect(scoreOpenStored()).toBe(false);
  });

  it("with storage off, holds the choice for the visit and never throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(scoreOpenStored()).toBe(false);
    expect(() => storeScoreOpen(true)).not.toThrow();
    expect(scoreOpenStored()).toBe(true);
  });
});
