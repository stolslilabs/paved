import { slow } from "../test-slow";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProfileProvider, type ProfileValue } from "../src/components/containers/profile-context";
import { PlayerBadge } from "../src/components/containers/player-badge";
import { LevelBar, levelText, xpText } from "../src/components/elements/level-bar";
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
const badge = (v: ProfileValue | null, league?: { crowns: number; attacks?: number }) =>
  wrap(v ? <ProfileProvider value={v}><PlayerBadge league={league} /></ProfileProvider> : <PlayerBadge league={league} />);
/** A connected player of that name (the mock's own). */
const named = (name: string): ProfileValue["state"] => ({ status: "connected", data: { ...PROFILE.connected.data, player: { ...PROFILE.connected.data.player, name } } });

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

describe("the level's star and bar (the owner's direction of 2026-11-01)", () => {
  it("writes the level in the star and the XP in the bar: two figures at most, Max at the cap", () => {
    expect(levelText(3)).toBe("3");
    expect(levelText(99)).toBe("99");
    expect(levelText(100)).toBe("99+");
    expect(levelText(undefined)).toBe("");
    expect(xpText(PROGRESS.partWay)).toBe("120/300");
    expect(xpText(PROGRESS.maxLevel)).toBe("Max");
    expect(xpText({ level: 9, xp: 1_250, xpForNext: 2_000 })).toBe("1,250/2,000");
  });

  it("fills the bar to the share of the level, full at the cap; the star is the HUD's", () => {
    // Under reduced motion the share is drawn at once (with motion it fills in: the next test).
    const { container, unmount } = render(wrap(<LevelBar progress={PROGRESS.partWay} />, "always"));
    const fill = container.querySelector<HTMLElement>("[data-slot=level-fill]")!;
    expect(fill.style.width).toBe(`${(120 / 300) * 100}%`);
    // The fill covers the track's silver bevel, inside its 1 px outline (the mockup's).
    expect(container.querySelector("[data-slot=level-recess]")).toHaveClass("inset-px", "rounded-r-[5px]");
    expect(container.querySelector("[data-slot=level]")).toHaveTextContent(/^3$/);
    expect(container.querySelector("[data-slot=xp]")).toHaveTextContent(/^120\/300$/);
    expect(container.querySelector("[data-slot=ui-icon][data-icon=level-star]")).not.toBeNull();
    unmount();
    // A first reading at the cap (a later one plays the level up first).
    const capped = render(wrap(<LevelBar progress={PROGRESS.maxLevel} />)).container;
    expect(capped.querySelector<HTMLElement>("[data-slot=level-fill]")!.style.width).toBe("100%");
    expect(capped.querySelector("[data-slot=xp]")).toHaveTextContent(/^Max$/);
  });

  it("on load fills from empty to the share, eased in and out; read again, it fills in again", async () => {
    const { container, rerender } = render(wrap(<LevelBar progress={PROGRESS.partWay} />));
    const width = () => parseFloat(container.querySelector<HTMLElement>("[data-slot=level-fill]")!.style.width);
    const share = (120 / 300) * 100;
    // A width part of the way: the fill moves there (a jump would land on the share at once).
    const partWay = () => waitFor(() => expect(width() > 0 && width() < share).toBe(true), { timeout: slow(3000) });
    expect(width()).toBe(0);
    expect(container.querySelector("[data-slot=level]")).toHaveTextContent(/^3$/);
    await partWay();
    await waitFor(() => expect(width()).toBe(share), { timeout: slow(3000) });
    rerender(wrap(<LevelBar progress={undefined} />));
    await waitFor(() => expect(width()).toBe(0), { timeout: slow(3000) });
    rerender(wrap(<LevelBar progress={PROGRESS.partWay} />));
    await partWay();
    await waitFor(() => expect(width()).toBe(share), { timeout: slow(3000) });
  });

  it("while the XP is read: the empty track, the star blank", () => {
    const { container } = render(wrap(<LevelBar progress={undefined} />));
    expect(container.querySelector<HTMLElement>("[data-slot=level-fill]")!.style.width).toBe("0%");
    expect(container.querySelector("[data-slot=level]")).toHaveTextContent(/^$/);
    expect(container.querySelector("[data-slot=xp]")).toHaveTextContent(/^$/);
  });

  it("a gain rises as +N XP; a level up turns the level over and flashes the bar; under reduced motion, a flash alone", async () => {
    const { container, rerender } = render(wrap(<LevelBar progress={{ level: 3, xp: 100, xpForNext: 300 }} />));
    rerender(wrap(<LevelBar progress={{ level: 3, xp: 140, xpForNext: 300 }} />));
    expect(await within(container).findByText("+40 XP")).toHaveAttribute("data-slot", "xp-gain");
    rerender(wrap(<LevelBar progress={{ level: 4, xp: 20, xpForNext: 350 }} />));
    await waitFor(() => expect(container.querySelector("[data-slot=level]")).toHaveTextContent(/^4$/), { timeout: slow(3000) });
    const reduced = render(wrap(<LevelBar progress={{ level: 3, xp: 100, xpForNext: 300 }} />, "always"));
    await act(async () => reduced.rerender(wrap(<LevelBar progress={{ level: 4, xp: 20, xpForNext: 350 }} />, "always")));
    expect(reduced.container.querySelector("[data-slot=level]")).toHaveTextContent(/^4$/);
    expect(reduced.container.querySelector("[data-slot=level-flash]")).not.toBeNull();
    expect(reduced.container.querySelector("[data-slot=xp-gain]")).toBeNull();
  });
});

describe("PlayerBadge, the player card (the owner's direction of 2026-11-01)", () => {
  it("names the level and the XP left; the avatar in its league's rim and crest, the name, the level's bar", async () => {
    const { container } = render(badge(value(), { crowns: 1_240, attacks: 4 }));
    const card = screen.getByRole("button", { name: "Profile: bal7hazar, level 3, 180 XP to level 4" });
    expect(card).toHaveAttribute("data-slot", "player-card");
    const name = within(card).getByText("bal7hazar");
    expect(name).toHaveClass("truncate", "font-black", "text-outline");
    expect(name).not.toHaveClass("font-display");
    expect(name).toHaveAttribute("title", "bal7hazar");
    // Within the home's room beside its balances; elsewhere (a story at 320 px) within the width it is given.
    expect(card).toHaveClass("max-w-[var(--profile-room,100%)]");
    // The rim and the crest are the League control's chunk; the portrait stands in a plain ring meanwhile.
    expect(card.querySelector("[data-slot=player-avatar]")).not.toBeNull();
    await waitFor(() => expect(card.querySelector("[data-slot=player-rim]")).not.toBeNull(), { timeout: slow(5000) });
    const rim = card.querySelector<HTMLElement>("[data-slot=player-rim]")!;
    expect(rim).toHaveAttribute("data-tier", leagueOf(1_240).id);
    expect(rim.querySelector("[data-slot=league-rim]")).toHaveAttribute("data-tier", leagueOf(1_240).id);
    expect(rim.querySelector("[data-slot=league-crest-icon]")).toHaveAttribute("data-tier", leagueOf(1_240).id);
    expect(rim.querySelector("[data-slot=player-avatar]")).not.toBeNull();
    await waitFor(() => expect(card.querySelector("[data-slot=level-bar]")).not.toBeNull(), { timeout: slow(5000) });
    expect(card.querySelector("[data-slot=level]")).toHaveTextContent(/^3$/);
    expect(card).not.toHaveTextContent("XP to Lv");
    expect(container.querySelector("[data-slot=xp-ring]")).toBeNull();
  });

  it("a player with no crowns and no attack: Unranked's rim; without the home's read, Wood's", async () => {
    const { unmount } = render(badge(value(), { crowns: 0, attacks: 0 }));
    await waitFor(() => expect(document.querySelector("[data-slot=player-rim]")).toHaveAttribute("data-tier", "unranked"), { timeout: slow(5000) });
    unmount();
    render(badge(value()));
    await waitFor(() => expect(document.querySelector("[data-slot=player-rim]")).toHaveAttribute("data-tier", leagueOf(0).id), { timeout: slow(5000) });
  });

  it("the longest name, 15 characters, ends with an ellipsis where the room ends", () => {
    render(badge(value({ state: named("CobblestoneKing") })));
    expect(screen.getByText("CobblestoneKing")).toHaveClass("truncate");
  });

  it("at the cap, max level in the name, 20 in the star", async () => {
    render(badge(value({ progress: PROGRESS.maxLevel })));
    const card = screen.getByRole("button", { name: "Profile: bal7hazar, level 20, max level" });
    await waitFor(() => expect(card.querySelector("[data-slot=level]")).toHaveTextContent(/^20$/), { timeout: slow(5000) });
  });

  it("the card opens the profile sheet", async () => {
    render(badge(value()));
    await userEvent.click(screen.getByRole("button", { name: /^Profile: bal7hazar/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("a guest: the silhouette and Guest, no level's bar; without the shell's profile, nothing", () => {
    const { container, rerender } = render(badge(value({ state: PROFILE.guest, progress: undefined })));
    expect(screen.getByRole("button", { name: "Profile: guest" })).toHaveTextContent("Guest");
    expect(container.querySelector("[data-slot=player-avatar]")).not.toBeNull();
    expect(container.querySelector("[data-slot=level-bar]")).toBeNull();
    rerender(badge(null));
    expect(container.querySelector("[data-slot=player-badge]")).toBeNull();
  });

  it("while the wallet looks: the placeholder in the ring, no name", () => {
    const { container } = render(badge(value({ state: PROFILE.loading, progress: undefined })));
    expect(container.querySelector("[data-slot=skeleton]")).not.toBeNull();
    expect(container.querySelector("[data-slot=player-name]")).toBeNull();
  });

  it("is the home's top left, its rim the league of the crowns under it; then the village score (#829)", async () => {
    const { container } = render(wrap(<ProfileProvider value={value()}><HomeVillageScene {...HOME_VILLAGE.view} /></ProfileProvider>));
    // The League control in its own chunk (FIRST-LOAD): a stand-in of its height until it comes.
    await screen.findByRole("button", { name: /^League: / });
    const corner = container.querySelector<HTMLElement>("[data-slot=player-badge]")!;
    expect(within(corner).getByRole("button", { name: /^Profile: bal7hazar, level 3/ })).toBeInTheDocument();
    await waitFor(() => expect(corner.querySelector("[data-slot=player-rim]")).toHaveAttribute("data-tier", leagueOf(HOME_VILLAGE.view.league!.crowns).id), { timeout: slow(5000) });
    // The column under the profile: the League control, then the village score.
    const column = screen.getByRole("button", { name: /^League: / }).parentElement!;
    const [league, score] = [...column.children] as HTMLElement[];
    expect(league).toHaveAccessibleName(/^League: /);
    expect(score).toHaveAttribute("data-slot", "village-score");
  });
});
