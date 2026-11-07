import { render, screen, waitFor } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ProfileSheet } from "../src/components/containers/profile-sheet";
import { levelShare, xpGained } from "../src/components/elements/xp-motion";
import { FIRST_LEVEL, progressOf, usePlayerProgress } from "../src/data/player-progress";
import { playerLevelOf } from "@paved/chain";
import { dataOf, fakeSources, renderData } from "./data-fakes";
import { PLAYER_ID, PROGRESS } from "../src/mocks/players";
import { PROFILE } from "../src/mocks/scenes";

const wrap = (ui: ReactNode, reduced: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced}>{ui}</MotionConfig>
  </LazyMotion>
);

describe("usePlayerProgress (#625, #641)", () => {
  it("reads Setup.player_level: the XP made in the level, out of the level's span; nothing for a guest", async () => {
    const fakes = fakeSources();
    expect(await dataOf(renderData(() => usePlayerProgress(PLAYER_ID), fakes.sources).result)).toEqual(FIRST_LEVEL);
    fakes.views.cobblePlayer(PLAYER_ID).account.xp = 125;
    const later = fakeSources({ views: fakes.views });
    expect(await dataOf(renderData(() => usePlayerProgress(PLAYER_ID), later.sources).result)).toEqual({ level: 2, xp: 25, xpForNext: 200, total: 125 });
    expect(fakes.views.calls).toContain(`player_level ${BigInt(PLAYER_ID)}`);
    expect(renderData(() => usePlayerProgress(null), fakes.sources).result.current).toEqual({ data: null, isPending: false, error: null });
  });


  it("maps the view's floors: level 10 starts at 4,500 XP, level 11 at 5,500", () => {
    expect(progressOf({ xp: 4600, level: 10, floor: 4500, next: 5500 })).toEqual({ level: 10, xp: 100, xpForNext: 1000, total: 4600 });
    expect(FIRST_LEVEL).toEqual(progressOf(playerLevelOf(0)));
  });

  it("a failed read ends the wait with its error", async () => {
    const fakes = fakeSources();
    fakes.views.cobblesFail = new Error("node down");
    const { result } = renderData(() => usePlayerProgress(PLAYER_ID), fakes.sources);
    await waitFor(() => expect(result.current.error?.message).toBe("node down"));
    expect(result.current.isPending).toBe(false);
  });
});

describe("the level's share and the XP gained (#625, #641)", () => {
  it("the share of the level and the XP gained, across levels too", () => {
    expect(levelShare(FIRST_LEVEL)).toBe(0);
    expect(levelShare(PROGRESS.partWay)).toBeCloseTo(0.4);
    expect(levelShare({ level: 1, xp: 150, xpForNext: 100 })).toBe(1);
    expect(xpGained({ level: 2, xp: 20, xpForNext: 200 }, { level: 2, xp: 70, xpForNext: 200 })).toBe(50);
    expect(xpGained({ level: 2, xp: 160, xpForNext: 200 }, { level: 3, xp: 30, xpForNext: 200 })).toBe(70);
    expect(xpGained({ level: 3, xp: 30, xpForNext: 200 }, { level: 2, xp: 160, xpForNext: 200 })).toBe(0);
    // With the totals of the curve (#641): 0 XP to 300 XP passes level 2 (200 XP), a gain of 300, not 100 + 300
    expect(xpGained(progressOf(playerLevelOf(0)), progressOf(playerLevelOf(300)))).toBe(300);
    expect(xpGained(progressOf(playerLevelOf(4600)), progressOf(playerLevelOf(19050)))).toBe(14450);
    expect(xpGained(progressOf(playerLevelOf(300)), progressOf(playerLevelOf(0)))).toBe(0);
  });
});

describe("the profile sheet's level (#830)", () => {
  /** The sheet's XP line (#830, PROFILE-DRAWER): the bar's figures said, the XP left to the next, the whole XP when known. */
  const xpLeft = (level: HTMLElement) => level.querySelector("[data-slot=xp-left]")!.textContent;
  const barText = (level: HTMLElement) => level.querySelector("[data-slot=xp]")!.textContent;

  it("the sheet shows the level, its bar, the XP made, the XP left and the whole XP (#830)", async () => {
    render(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} progress={FIRST_LEVEL} />));
    const sheet = await screen.findByRole("dialog");
    const level = sheet.querySelector<HTMLElement>("[data-slot=player-level]")!;
    // The title reads "Level" alone (the owner's ask of 2026-11-04): the level's number is the bar's star's.
    expect(level.querySelector("h3")).toHaveTextContent(/^Level$/);
    expect(level.querySelector("[data-slot=level]")).toHaveTextContent("1");
    expect(barText(level)).toBe("0 / 100 XP");
    expect(xpLeft(level)).toBe("0 XP made of 100, 100 XP to level 2 · 0 XP in all");
    expect(level.querySelector("[data-slot=level-bar]")).not.toBeNull();
  });

  it("the sheet's XP part way, without the whole XP when the source does not know it, and at the cap", async () => {
    const { rerender } = render(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} progress={PROGRESS.partWay} />));
    const level = () => screen.getByRole("dialog").querySelector<HTMLElement>("[data-slot=player-level]")!;
    await screen.findByRole("dialog");
    expect(barText(level())).toBe("120 / 300 XP");
    expect(xpLeft(level())).toBe("120 XP made of 300, 180 XP to level 4 · 420 XP in all");
    rerender(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} progress={PROGRESS.nearlyFull} />));
    expect(xpLeft(level())).toBe("470 XP made of 500, 30 XP to level 8");
    // At the cap (the star turns to 20 after the bar's level-up, which jsdom does not play): "Max level" on the bar.
    rerender(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} progress={PROGRESS.maxLevel} />));
    expect(barText(level())).toBe("Max level");
    expect(xpLeft(level())).toBe("0 XP made, Max level");
  });
});
