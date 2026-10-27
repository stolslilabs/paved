import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlayerBadge } from "../src/components/containers/player-badge";
import { ProfileProvider, type ProfileValue } from "../src/components/containers/profile-context";
import { XpBar } from "../src/components/elements/xp-bar";
import { isMaxLevel, levelLabel, xpLeftText } from "../src/components/elements/xp-level";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { leagueOf } from "../src/lib/pvp-rules";
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
const badge = (v: ProfileValue | null, crowns: number, onLeague = vi.fn(), reduced: "never" | "always" = "never") =>
  wrap(v ? <ProfileProvider value={v}><PlayerBadge crowns={crowns} onLeague={onLeague} /></ProfileProvider> : <PlayerBadge crowns={crowns} onLeague={onLeague} />, reduced);
const border = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-slot=league-border]")!;

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

describe("PlayerBadge (#787)", () => {
  it("names the level, the XP left, the league and the crowns", () => {
    render(badge(value(), 1_240));
    const profile = screen.getByRole("button", { name: "Profile: bal7hazar, level 3, 180 XP to level 4" });
    expect(profile).toHaveTextContent("bal7hazar");
    expect(profile).toHaveTextContent("Lv 3");
    expect(profile).toHaveTextContent("180 XP to Lv 4");
    expect(screen.getByRole("button", { name: `League: ${leagueOf(1_240).name}, 1,240 crowns` })).toBeInTheDocument();
  });

  it("at the cap, Max level in the name and under the bar", () => {
    render(badge(value({ progress: PROGRESS.maxLevel }), 0));
    expect(screen.getByRole("button", { name: "Profile: bal7hazar, level 20, max level" })).toHaveTextContent("Max level");
  });

  it("frames the avatar in its league's colour: Wanderer grey, a group's crest colour, Sovereign", () => {
    const { container, rerender } = render(badge(value(), 0));
    expect(border(container)).toHaveClass("border-league-wanderer");
    rerender(badge(value(), 1_240));
    expect(border(container)).toHaveClass(`border-league-${leagueOf(1_240).id}`);
    rerender(badge(value(), 5_320));
    expect(border(container)).toHaveClass("border-league-sovereign");
  });

  it("a promotion pulses the border in its new colour; none under reduced motion, nor on a drop", async () => {
    const { container, rerender } = render(badge(value(), 1_240));
    expect(container.querySelector("[data-slot=league-promotion]")).toBeNull();
    rerender(badge(value(), 1_400));
    await waitFor(() => expect(container.querySelector("[data-slot=league-promotion]")).not.toBeNull());
    expect(border(container)).toHaveClass("transition-colors");

    const reduced = render(badge(value(), 1_240, vi.fn(), "always"));
    reduced.rerender(badge(value(), 1_400, vi.fn(), "always"));
    await act(async () => {});
    expect(reduced.container.querySelector("[data-slot=league-promotion]")).toBeNull();
    expect(border(reduced.container)).not.toHaveClass("transition-colors");
  });

  it("the avatar opens the profile sheet; the badge and the crowns the League page", async () => {
    const onLeague = vi.fn();
    render(badge(value(), 1_240, onLeague));
    await userEvent.click(screen.getByRole("button", { name: /^League: / }));
    expect(onLeague).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Profile: bal7hazar/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("a guest: the silhouette and Guest, no XP bar; without the shell's profile, the league alone", () => {
    const { container, rerender } = render(badge(value({ state: PROFILE.guest, progress: undefined }), 0));
    expect(screen.getByRole("button", { name: "Profile: guest" })).toHaveTextContent("Guest");
    expect(container.querySelector("[data-slot=xp-bar]")).toBeNull();
    rerender(badge(null, 0));
    expect(screen.queryByRole("button", { name: /^Profile/ })).toBeNull();
    expect(screen.getByRole("button", { name: `League: ${leagueOf(0).name}, 0 crowns` })).toBeInTheDocument();
  });

  it("is the home's top left, with the village score under it; no XP ring there", () => {
    const { container } = render(wrap(<ProfileProvider value={value()}><HomeVillageScene {...HOME_VILLAGE.view} /></ProfileProvider>));
    const corner = container.querySelector<HTMLElement>("[data-slot=player-badge]")!;
    expect(within(corner).getByRole("button", { name: /^Profile: bal7hazar, level 3/ })).toBeInTheDocument();
    expect(within(corner).getByRole("button", { name: /^League: / })).toBeInTheDocument();
    expect(corner.nextElementSibling).toHaveAccessibleName(/^Village score /);
    expect(container.querySelector("[data-slot=xp-ring]")).toBeNull();
  });
});
