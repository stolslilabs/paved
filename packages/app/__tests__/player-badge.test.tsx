import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlayerBadge } from "../src/components/containers/player-badge";
import { ProfileProvider, type ProfileValue } from "../src/components/containers/profile-context";
import { XpBar } from "../src/components/elements/xp-bar";
import { isMaxLevel, levelLabel, xpLeftText } from "../src/components/elements/xp-level";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { PROGRESS } from "../src/mocks/players";
import { PROFILE } from "../src/mocks/scenes";
import { HOME_VILLAGE } from "../src/mocks/village-v2";

const wrap = (ui: ReactNode, reduced: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced}>{ui}</MotionConfig>
  </LazyMotion>
);
const value = (over: Partial<ProfileValue> = {}): ProfileValue => ({
  state: PROFILE.connected,
  progress: PROGRESS.partWay,
  onConnect: vi.fn(),
  onDisconnect: vi.fn(),
  onCopy: vi.fn(async () => {}),
  ...over,
});
const badge = (v: ProfileValue | null) => wrap(v ? <ProfileProvider value={v}><PlayerBadge /></ProfileProvider> : <PlayerBadge />);

describe("the XP left (#787)", () => {
  it("says the XP to the next level, or Max level at the cap (20, #734)", () => {
    expect(xpLeftText(PROGRESS.partWay)).toBe("180 XP to Lv 4");
    expect(levelLabel(PROGRESS.partWay)).toBe("level 3, 180 XP to level 4");
    expect(isMaxLevel(PROGRESS.maxLevel)).toBe(true);
    expect(isMaxLevel({ level: 20, xp: 10, xpForNext: 100 })).toBe(false);
    expect(xpLeftText(PROGRESS.maxLevel)).toBe("Max level");
    expect(levelLabel(PROGRESS.maxLevel)).toBe("level 20, max level");
    expect(xpLeftText(PROGRESS.stress)).toBe("24,691 XP to Lv 1,235");
  });
});

describe("XpBar (#787)", () => {
  it("draws the level, the share of it and the XP left; the bar full at the cap", async () => {
    const { container, rerender } = render(wrap(<XpBar progress={PROGRESS.partWay} />));
    expect(container).toHaveTextContent("Lv 3");
    expect(container).toHaveTextContent("180 XP to Lv 4");
    const fill = () => container.querySelector<HTMLElement>("[data-slot=xp-fill]")!;
    await waitFor(() => expect(fill().style.transform).toMatch(/scaleX\(0\.4\)/));
    rerender(wrap(<XpBar progress={PROGRESS.maxLevel} />));
    expect(container).toHaveTextContent("Max level");
    await waitFor(() => expect(fill().style.transform).not.toMatch(/scaleX/));
  });

  it("a gain rises as +N XP; a level up flashes the bar and turns the level over", async () => {
    const { container, rerender } = render(wrap(<XpBar progress={{ level: 2, xp: 20, xpForNext: 200 }} />));
    rerender(wrap(<XpBar progress={{ level: 2, xp: 70, xpForNext: 200 }} />));
    expect(screen.getByText("+50 XP")).toBeInTheDocument();
    rerender(wrap(<XpBar progress={{ level: 3, xp: 30, xpForNext: 200 }} />));
    expect(screen.getByText("+160 XP")).toBeInTheDocument();
    // The bar completes first, then the level turns over with a flash.
    expect(container.querySelector("[data-slot=level]")).toHaveTextContent("Lv 2");
    await waitFor(() => expect(container.querySelector("[data-slot=level]")).toHaveTextContent("Lv 3"));
    expect(container.querySelector("[data-slot=xp-flash]")).not.toBeNull();
  });

  it("reduced motion: the values change at once with a flash, no rising text", () => {
    const { container, rerender } = render(wrap(<XpBar progress={{ level: 2, xp: 160, xpForNext: 200 }} />, "always"));
    rerender(wrap(<XpBar progress={{ level: 3, xp: 30, xpForNext: 200 }} />, "always"));
    expect(container.querySelector("[data-slot=level]")).toHaveTextContent("Lv 3");
    expect(container.querySelector("[data-slot=xp-flash]")).not.toBeNull();
    expect(container.querySelector("[data-slot=xp-gain]")).toBeNull();
  });
});

describe("PlayerBadge (#787, the league out of it since #829)", () => {
  it("names the level and the XP left; no league, crowns nor league border", () => {
    const { container } = render(badge(value()));
    const profile = screen.getByRole("button", { name: "Profile: bal7hazar, level 3, 180 XP to level 4" });
    expect(profile).toHaveTextContent("bal7hazar");
    expect(profile).toHaveTextContent("Lv 3");
    expect(profile).toHaveTextContent("180 XP to Lv 4");
    expect(screen.queryByRole("button", { name: /^League/ })).toBeNull();
    expect(container.querySelector("[data-slot=league-border]")).toBeNull();
  });

  it("at the cap, Max level in the name and under the bar", () => {
    render(badge(value({ progress: PROGRESS.maxLevel })));
    expect(screen.getByRole("button", { name: "Profile: bal7hazar, level 20, max level" })).toHaveTextContent("Max level");
  });

  it("the avatar opens the profile sheet", async () => {
    render(badge(value()));
    await userEvent.click(screen.getByRole("button", { name: /^Profile: bal7hazar/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("a guest: the silhouette and Guest, no XP bar; without the shell's profile, nothing", () => {
    const { container, rerender } = render(badge(value({ state: PROFILE.guest, progress: undefined })));
    expect(screen.getByRole("button", { name: "Profile: guest" })).toHaveTextContent("Guest");
    expect(container.querySelector("[data-slot=xp-bar]")).toBeNull();
    rerender(badge(null));
    expect(container.querySelector("[data-slot=player-badge]")).toBeNull();
  });

  it("is the home's top left; under it the League control, then the village score (#829); no XP ring there", () => {
    const { container } = render(wrap(<ProfileProvider value={value()}><HomeVillageScene {...HOME_VILLAGE.view} /></ProfileProvider>));
    const corner = container.querySelector<HTMLElement>("[data-slot=player-badge]")!;
    expect(within(corner).getByRole("button", { name: /^Profile: bal7hazar, level 3/ })).toBeInTheDocument();
    const league = corner.nextElementSibling as HTMLElement;
    expect(league).toHaveAccessibleName(/^League: /);
    expect(league.nextElementSibling).toHaveAccessibleName(/^Village score /);
    expect(container.querySelector("[data-slot=xp-ring]")).toBeNull();
  });
});
