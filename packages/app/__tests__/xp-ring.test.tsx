import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProfileProvider, ProfileSlot, type ProfileValue } from "../src/components/containers/profile-context";
import { ProfileSheet } from "../src/components/containers/profile-sheet";
import { levelShare, xpGained, XpRing } from "../src/components/elements/xp-ring";
import { FIRST_LEVEL, usePlayerProgress } from "../src/data/player-progress";
import { PLAYER_ID, PROGRESS } from "../src/mocks/players";
import { PROFILE } from "../src/mocks/scenes";

const wrap = (ui: ReactNode, reduced: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced}>{ui}</MotionConfig>
  </LazyMotion>
);

describe("usePlayerProgress (#625)", () => {
  it("is level 1 with 0 XP for every player until the contracts define XP; nothing for a guest", () => {
    expect(renderHook(() => usePlayerProgress(PLAYER_ID)).result.current).toEqual({ data: { level: 1, xp: 0, xpForNext: 100 }, isPending: false, error: null });
    expect(renderHook(() => usePlayerProgress(null)).result.current.data).toBeNull();
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
  });

  it("shows the level badge; none while the progress is read", () => {
    const { container, rerender } = render(wrap(<XpRing progress={PROGRESS.partWay} />));
    expect(container.querySelector("[data-slot=level-badge]")).toHaveTextContent("3");
    rerender(wrap(<XpRing progress={undefined} />));
    expect(container.querySelector("[data-slot=level-badge]")).toBeNull();
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
