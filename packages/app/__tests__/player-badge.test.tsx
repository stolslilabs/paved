import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProfileProvider, type ProfileValue } from "../src/components/containers/profile-context";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PlayerBadge, nameSize } from "../src/components/containers/player-badge";
import { badgeWidth, BAR_OUTLINE, barHeight, isMaxLevel, levelLabel, levelPath, pathPoint, tagFont, tagText, tagWidth, XpPathStill, xpLeftText } from "../src/components/elements/xp-level";
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

/** The avatar's three sizes (the season dial's, #856): 96, 108 from 390 px wide, 144 from `tablet`. */
const BOXES = [96, 108, 144];

describe("the level's path (#830, reshaped by #928)", () => {
  it("an arc from the avatar's right clockwise to its top, inside its box with the outline, then a line to the tag", () => {
    const { d, arc, line, length, r, tag } = levelPath(96);
    // The bar 14 px thick, its outline 2: the arc's middle 9 px inside the box. From 3 o'clock (87, 48) clockwise to 12 o'clock.
    expect(r).toBe(39);
    expect(d).toBe("M 87 48 A 39 39 0 1 1 48 9 h 44");
    expect(arc).toBeCloseTo(1.5 * Math.PI * 39);
    // From the avatar's top (48) to the tag's left edge (144 - 52).
    expect(tag).toBe(92);
    expect(line).toBe(44);
    expect(length).toBeCloseTo(arc + line);
  });

  it("lays the share on the whole path: the arc fills first, then the line, in proportion", () => {
    const { arc, length, line } = levelPath(96);
    const at = (share: number) => pathPoint(share, 96);
    expect(at(0)).toEqual({ x: 87, y: 48 });
    // A third of the arc: a quarter turn clockwise, the avatar's bottom.
    const bottom = at(arc / 3 / length);
    expect(bottom.x).toBeCloseTo(48);
    expect(bottom.y).toBeCloseTo(87);
    // The arc full: the avatar's top, where the line starts.
    const top = at(arc / length);
    expect(top.x).toBeCloseTo(48);
    expect(top.y).toBeCloseTo(9);
    // Past it, along the line; the whole level ends at the tag.
    expect(at((arc + line / 2) / length).x).toBeCloseTo(70);
    expect(at(1).x).toBeCloseTo(92);
    expect(at(2)).toEqual(at(1));
  });
});

describe("the badge's shape (#928)", () => {
  it("is at most 1.5 times the avatar's width, the tag included, at each avatar size", () => {
    for (const box of BOXES) {
      const { tag } = levelPath(box);
      expect(badgeWidth(box)).toBe(1.5 * box);
      expect(tag + tagWidth(box)).toBe(badgeWidth(box));
      // The line runs from the avatar's top (its middle) to the tag, never back over the avatar.
      expect(levelPath(box).line).toBeGreaterThan(0);
    }
    expect(BOXES.map(badgeWidth)).toEqual([144, 162, 216]);
  });

  it("the button's widths are 1.5 times the avatar's at each width (the classes, as Tailwind lays them)", () => {
    const { container } = render(badge(value()));
    const rem = (cls: string, prefix: string) => {
      const m = new RegExp(`(?:^|\\s)${prefix.replace(/[.[\]()]/g, "\\$&")}(\\d+(?:\\.\\d+)?|\\[(\\d+(?:\\.\\d+)?)rem\\])(?:\\s|$)`).exec(cls);
      if (!m) throw new Error(`no ${prefix} in ${cls}`);
      return m[2] ? Number(m[2]) * 16 : Number(m[1]) * 4;
    };
    const avatar = container.querySelector("[data-slot=player-avatar]")!.className;
    const button = screen.getByRole("button").className;
    for (const [size, width] of [["size-", "w-"], ["min-[24.375rem]:size-", "min-[24.375rem]:w-"], ["tablet:size-", "tablet:w-"]] as const) {
      const box = rem(avatar, size);
      expect(BOXES).toContain(box);
      expect(rem(button, width)).toBe(badgeWidth(box));
    }
  });

  it("the tag has one width for every level from 1 to 99, which holds Lv 99 in tabular figures", () => {
    for (const box of BOXES) {
      const widths = new Set<string>();
      for (let level = 1; level <= 99; level++) {
        const { container, unmount } = render(wrap(<XpPathStill progress={{ level, xp: 0, xpForNext: 100 }} box={box} />));
        const tag = container.querySelector<HTMLElement>("[data-slot=level]")!;
        expect(tag).toHaveTextContent(`Lv ${level}`);
        widths.add(tag.style.width);
        // The bar's height and outline: the tag continues the line at the same height.
        expect(tag.style.height).toBe(`${barHeight(box) + 2 * BAR_OUTLINE}px`);
        expect(tag.style.left).toBe(`${levelPath(box).tag}px`);
        unmount();
      }
      expect([...widths]).toEqual([`${tagWidth(box)}px`]);
      // "Lv 99": 5 figures of Space Mono's 0.6 em, plus 4 px of padding each side and the outline.
      expect(5 * 0.6 * tagFont(box) + 8 + BAR_OUTLINE).toBeLessThanOrEqual(tagWidth(box));
      // The figures read: at least 12 px, inside the bar's height.
      expect(tagFont(box)).toBeGreaterThanOrEqual(12);
      expect(tagFont(box)).toBeLessThanOrEqual(barHeight(box));
    }
    expect(tagText(undefined)).toBe("Lv");
    expect(tagText(1_234)).toBe("99+");
  });

  it("the bar is opaque: its track and its outline, no alpha in their colours; every end square", () => {
    const { container } = render(wrap(<XpPathStill progress={PROGRESS.partWay} box={96} />));
    const outline = container.querySelector("[data-slot=xp-outline]")!;
    const track = container.querySelector("[data-slot=xp-track]")!;
    expect(outline.getAttribute("class")).toBe("stroke-background");
    expect(track.getAttribute("class")).toBe("stroke-level-track");
    for (const p of container.querySelectorAll("path")) expect(p.getAttribute("stroke-linecap")).toBe("butt");
    const tag = container.querySelector("[data-slot=level]")!;
    expect(tag.className).toMatch(/(^|\s)border-background(\s|$)/);
    expect(tag.className).toMatch(/(^|\s)bg-resource-plate(\s|$)/);
    // The tokens, as theme.css defines them: no alpha, and the track mixed from two opaque tokens.
    const css = readFileSync(resolve(import.meta.dirname, "../src/styles/theme.css"), "utf8");
    const token = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(css)![1]!;
    expect(token("level-track")).toBe("color-mix(in oklab, var(--primary) 32%, var(--background))");
    for (const name of ["background", "primary", "resource-plate"]) expect(token(name)).toMatch(/^var\(--(color|accent)-[a-z]+-\d+\)$/);
    for (const name of ["level-track", "background", "primary", "resource-plate"]) expect(token(name)).not.toMatch(/\/|rgba|transparent/);
  });

  it("the name's size: its own when it fits beside the avatar, else smaller, never under 12 px", () => {
    expect(nameSize("Al", 96)).toBe(16);
    expect(nameSize("Al", 144)).toBe(20);
    expect(nameSize("bal7hazar", 144)).toBeLessThan(20);
    for (const box of BOXES) expect(nameSize("A name of twenty chr", box)).toBe(12);
  });
});

describe("PlayerBadge (#787, the league out of it since #829, the level's path since #830)", () => {
  it("names the level and the XP left; the name in the display font after the User icon on its band, Lv i at the line's end; no XP left on the home", async () => {
    const { container } = render(badge(value()));
    const profile = screen.getByRole("button", { name: "Profile: bal7hazar, level 3, 180 XP to level 4" });
    expect(profile).toHaveTextContent("bal7hazar");
    const name = within(profile).getByText("bal7hazar");
    expect(name.closest("[data-slot=name-row]")).toHaveClass("font-display");
    expect(name).toHaveAttribute("title", "bal7hazar");
    expect(name).toHaveClass("truncate");
    // The User icon before it, a game icon; the band starts behind the avatar (its middle) and fades out to the badge's end.
    expect(name.previousElementSibling).toHaveAttribute("data-icon", "user");
    const band = profile.querySelector<HTMLElement>("[data-slot=name-band]")!;
    expect(band.style.left).toBe("-48px");
    expect(band.className).toContain("[mask-image:linear-gradient(to_right,black,transparent)]");
    expect(profile.querySelector<HTMLElement>("[data-slot=name-row]")!.style.left).toBe("96px");
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
