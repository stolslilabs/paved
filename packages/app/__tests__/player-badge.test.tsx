import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlayerBadge } from "../src/components/containers/player-badge";
import { ProfileProvider, type ProfileValue } from "../src/components/containers/profile-context";
import { isMaxLevel, levelLabel, levelPath, pathPoint, xpLeftText } from "../src/components/elements/xp-level";
import { XpPath } from "../src/components/elements/xp-path";
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

describe("the level's path (#830)", () => {
  it("an arc from the avatar's right clockwise to its top, three quarters of a circle, then a line to the column's end", () => {
    const { d, arc, line, length } = levelPath(128);
    // From 3 o'clock (42.5, 22) clockwise (the large arc, sweep 1) to 12 o'clock (22, 1.5), then right.
    expect(d).toBe("M 42.5 22 A 20.5 20.5 0 1 1 22 1.5 h 150");
    expect(arc).toBeCloseTo(1.5 * Math.PI * 20.5);
    expect(line).toBe(150);
    expect(length).toBeCloseTo(arc + line);
  });

  it("lays the share on the whole path: the arc fills first, then the line, in proportion", () => {
    const column = 128;
    const { arc, length } = levelPath(column);
    const at = (share: number) => pathPoint(share, column);
    expect(at(0)).toEqual({ x: 42.5, y: 22 });
    // A third of the arc: a quarter turn clockwise, the avatar's bottom.
    const bottom = at(arc / 3 / length);
    expect(bottom.x).toBeCloseTo(22);
    expect(bottom.y).toBeCloseTo(42.5);
    // The arc full: the avatar's top, where the line starts.
    const top = at(arc / length);
    expect(top.x).toBeCloseTo(22);
    expect(top.y).toBeCloseTo(1.5);
    // Past it, along the line; the whole level ends at the column's end (the avatar's 44 px and the column).
    const half = at((arc + 75) / length);
    expect(half.x).toBeCloseTo(97);
    expect(half.y).toBeCloseTo(1.5);
    expect(at(1).x).toBeCloseTo(44 + column);
    expect(at(2)).toEqual(at(1));
  });
});

describe("XpPath (#830)", () => {
  const path = (progress: Parameters<typeof XpPath>[0]["progress"]) => <XpPath progress={progress} column={128} />;

  it("draws the share of the level on the path and Lv i at its end; the path full at the cap", async () => {
    const { container, rerender } = render(wrap(path(PROGRESS.partWay)));
    expect(container.querySelector("[data-slot=level]")).toHaveTextContent("Lv 3");
    const fill = () => container.querySelector("[data-slot=xp-fill]")!;
    await waitFor(() => expect(fill().getAttribute("stroke-dasharray")).toMatch(/^0\.4 /));
    // Level 3 to the cap: a level up, the level turns over once the path completes.
    rerender(wrap(path(PROGRESS.maxLevel)));
    await waitFor(() => expect(container.querySelector("[data-slot=level]")).toHaveTextContent("Lv 20"));
    await waitFor(() => expect(fill().getAttribute("stroke-dasharray")).toMatch(/^1 /));
  });

  it("while the XP is read: the empty track and Lv alone", async () => {
    const { container } = render(wrap(path(undefined)));
    expect(container.querySelector("[data-slot=level]")).toHaveTextContent(/^Lv$/);
    await waitFor(() => expect(container.querySelector("[data-slot=xp-fill]")!.getAttribute("stroke-dasharray")).toMatch(/^0 /));
  });

  it("a gain rises as +N XP at the progress's end; a level up flashes the path and turns the level over", async () => {
    const { container, rerender } = render(wrap(path({ level: 2, xp: 20, xpForNext: 200 })));
    rerender(wrap(path({ level: 2, xp: 70, xpForNext: 200 })));
    const gain = screen.getByText("+50 XP");
    const end = pathPoint(70 / 200, 128);
    expect(gain.style.left).toBe(`${end.x}px`);
    expect(gain.style.top).toBe(`${end.y}px`);
    rerender(wrap(path({ level: 3, xp: 30, xpForNext: 200 })));
    expect(screen.getByText("+160 XP")).toBeInTheDocument();
    // The path completes first, then the level turns over with a flash.
    expect(container.querySelector("[data-slot=level]")).toHaveTextContent("Lv 2");
    await waitFor(() => expect(container.querySelector("[data-slot=level]")).toHaveTextContent("Lv 3"));
    expect(container.querySelector("[data-slot=xp-flash]")).not.toBeNull();
  });

  it("reduced motion: the values change at once with a flash, no rising text", () => {
    const { container, rerender } = render(wrap(path({ level: 2, xp: 160, xpForNext: 200 }), "always"));
    rerender(wrap(path({ level: 3, xp: 30, xpForNext: 200 }), "always"));
    expect(container.querySelector("[data-slot=level]")).toHaveTextContent("Lv 3");
    expect(container.querySelector("[data-slot=xp-flash]")).not.toBeNull();
    expect(container.querySelector("[data-slot=xp-gain]")).toBeNull();
  });
});

describe("PlayerBadge (#787, the league out of it since #829, the level's path since #830)", () => {
  it("names the level and the XP left; the name in the display font under the line, Lv i at its end; no XP left on the home", async () => {
    const { container } = render(badge(value()));
    const profile = screen.getByRole("button", { name: "Profile: bal7hazar, level 3, 180 XP to level 4" });
    expect(profile).toHaveTextContent("bal7hazar");
    expect(within(profile).getByText("bal7hazar")).toHaveClass("font-display");
    await waitFor(() => expect(profile.querySelector("[data-slot=xp-path]")).not.toBeNull());
    expect(profile.querySelector("[data-slot=level]")).toHaveTextContent("Lv 3");
    expect(profile).not.toHaveTextContent("XP to Lv");
    expect(screen.queryByRole("button", { name: /^League/ })).toBeNull();
    expect(container.querySelector("[data-slot=league-border]")).toBeNull();
  });

  it("at the cap, max level in the name, Lv 20 at the line's end", () => {
    render(badge(value({ progress: PROGRESS.maxLevel })));
    expect(screen.getByRole("button", { name: "Profile: bal7hazar, level 20, max level" })).toHaveTextContent("Lv 20");
  });

  it("the avatar opens the profile sheet", async () => {
    render(badge(value()));
    await userEvent.click(screen.getByRole("button", { name: /^Profile: bal7hazar/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("a guest: the silhouette and Guest, no path; without the shell's profile, nothing", () => {
    const { container, rerender } = render(badge(value({ state: PROFILE.guest, progress: undefined })));
    expect(screen.getByRole("button", { name: "Profile: guest" })).toHaveTextContent("Guest");
    expect(container.querySelector("[data-slot=xp-path]")).toBeNull();
    expect(container.querySelector("[data-slot=level]")).toBeNull();
    rerender(badge(null));
    expect(container.querySelector("[data-slot=player-badge]")).toBeNull();
  });

  it("is the home's top left; under it the League control, then the village score (#829); no XP ring there", async () => {
    const { container } = render(wrap(<ProfileProvider value={value()}><HomeVillageScene {...HOME_VILLAGE.view} /></ProfileProvider>));
    // The League control in its own chunk (FIRST-LOAD): a stand-in of its height until it comes.
    await screen.findByRole("button", { name: /^League: / });
    const corner = container.querySelector<HTMLElement>("[data-slot=player-badge]")!;
    expect(within(corner).getByRole("button", { name: /^Profile: bal7hazar, level 3/ })).toBeInTheDocument();
    // The avatar at the season dial's size (#856).
    expect(corner.querySelector("[data-slot=player-avatar]")!.className).toContain("tablet:size-36");
    // The column under the profile (#856, centred between it and the dial): the League control, then the village score.
    const column = screen.getByRole("button", { name: /^League: / }).parentElement!;
    const [league, score] = [...column.children] as HTMLElement[];
    expect(league).toHaveAccessibleName(/^League: /);
    expect(score).toHaveAttribute("data-slot", "village-score");
    expect(within(score!).getByRole("button")).toHaveAccessibleName(/^Village score /);
    expect(container.querySelector("[data-slot=xp-ring]")).toBeNull();
  });
});
