import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProfileProvider, ProfileSlot, type ProfileValue } from "../src/components/containers/profile-context";
import { ProfileSheet } from "../src/components/containers/profile-sheet";
import { levelShare, xpGained, XpRing } from "../src/components/elements/xp-ring";
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

describe("XpRing (#625)", () => {
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

  it("shows the level badge; none while the progress is read", () => {
    const { container, rerender } = render(wrap(<XpRing progress={PROGRESS.partWay} />));
    expect(container.querySelector("[data-slot=level-badge]")).toHaveTextContent("3");
    rerender(wrap(<XpRing progress={undefined} />));
    expect(container.querySelector("[data-slot=level-badge]")).toBeNull();
  });

  it("read again: the filled arc empties, and the next reading is drawn without a gain", async () => {
    const { container, rerender } = render(wrap(<XpRing progress={PROGRESS.partWay} />));
    const arc = () => container.querySelectorAll("circle")[1]!;
    await waitFor(() => expect(arc().getAttribute("stroke-dasharray")).toMatch(/^0\.4/));
    rerender(wrap(<XpRing progress={undefined} />));
    await waitFor(() => expect(arc().getAttribute("stroke-dasharray")).toMatch(/^0 /));
    rerender(wrap(<XpRing progress={PROGRESS.nearlyFull} />));
    expect(container.querySelector("[data-slot=xp-gain]")).toBeNull();
    expect(container.querySelector("[data-slot=level-badge]")).toHaveTextContent("7");
  });

  it("a gain rises as +N XP; a level up turns the badge to the next level with a burst", async () => {
    const { container, rerender } = render(wrap(<XpRing progress={{ level: 2, xp: 20, xpForNext: 200 }} />));
    expect(container.querySelector("[data-slot=xp-gain]")).toBeNull();
    rerender(wrap(<XpRing progress={{ level: 2, xp: 70, xpForNext: 200 }} />));
    expect(screen.getByText("+50 XP")).toBeInTheDocument();
    rerender(wrap(<XpRing progress={{ level: 3, xp: 30, xpForNext: 200 }} />));
    expect(screen.getByText("+160 XP")).toBeInTheDocument();
    // The ring completes first, then the badge turns over.
    expect(container.querySelector("[data-slot=level-badge]")).toHaveTextContent("2");
    await waitFor(() => expect(container.querySelector("[data-slot=level-badge]")).toHaveTextContent("3"));
    expect(container.querySelector("[data-slot=xp-burst]")).not.toBeNull();
  });

  it("a refresh that skips a level shows the XP really gained, on the chain's curve (#641)", async () => {
    // 0 XP (level 1) to 300 XP (level 3): level 2 costs 200, so +300, not 100 + 300
    const { container, rerender } = render(wrap(<XpRing progress={progressOf(playerLevelOf(0))} />));
    rerender(wrap(<XpRing progress={progressOf(playerLevelOf(300))} />));
    expect(screen.getByText("+300 XP")).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector("[data-slot=level-badge]")).toHaveTextContent("3"));
  });

  it("reduced motion: the values change at once with a flash, no rising text, no burst", () => {
    const { container, rerender } = render(wrap(<XpRing progress={{ level: 2, xp: 160, xpForNext: 200 }} />, "always"));
    rerender(wrap(<XpRing progress={{ level: 3, xp: 30, xpForNext: 200 }} />, "always"));
    expect(container.querySelector("[data-slot=level-badge]")).toHaveTextContent("3");
    expect(container.querySelector("[data-slot=xp-flash]")).not.toBeNull();
    expect(container.querySelector("[data-slot=xp-gain]")).toBeNull();
    expect(container.querySelector("[data-slot=xp-burst]")).toBeNull();
  });
});

describe("the ring around the avatar (#625)", () => {
  const value: ProfileValue = { state: PROFILE.connected, progress: FIRST_LEVEL, onConnect: vi.fn(), onDisconnect: vi.fn(), onCopy: vi.fn(async () => {}) };
  const slot = (v: ProfileValue) =>
    wrap(
      <ProfileProvider value={v}>
        <ProfileSlot />
      </ProfileProvider>,
    );

  it("the menus' avatar draws the ring in its own chunk and says the level; a guest has none", async () => {
    const { container, rerender } = render(slot(value));
    expect(screen.getByRole("button", { name: "Profile: bal7hazar, level 1" })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector("[data-slot=xp-ring]")).not.toBeNull());
    expect(container.querySelector("[data-slot=level-badge]")).toHaveTextContent("1");
    rerender(slot({ ...value, state: PROFILE.guest, progress: undefined }));
    await act(async () => {});
    expect(container.querySelector("[data-slot=xp-ring]")).toBeNull();
  });

  it("the sheet shows the level and 0 / N XP around the larger avatar", async () => {
    render(wrap(<ProfileSheet open onOpenChange={() => {}} state={PROFILE.connected} progress={FIRST_LEVEL} />));
    const sheet = await screen.findByRole("dialog");
    const level = sheet.querySelector<HTMLElement>("[data-slot=player-level]")!;
    expect(level).toHaveTextContent("Level 1");
    expect(within(level).getByText("0 / 100 XP")).toBeInTheDocument();
    expect(sheet.querySelector("[data-slot=xp-ring]")).not.toBeNull();
  });
});
