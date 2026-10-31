import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProfileProvider, type ProfileValue } from "../src/components/containers/profile-context";
import { badgeLayout, NAME_ROOM, nameSize, PlayerBadge } from "../src/components/containers/player-badge";
import { BADGE_ART, badgeArtSources, badgeArtUrl, barUrl, BAR_BAND, BAR_CORE, BAR_RADIUS, GROOVE, levelBar, PORTRAIT, SHIELD_HEIGHT, SHIELD_RISE } from "../src/components/elements/badge-art";
import { arcPoint, LevelRing, levelArc, levelFont, levelText } from "../src/components/elements/level-ring";
import { isMaxLevel, levelLabel, xpLeftText } from "../src/components/elements/xp-level";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { PLAYER_NAME_MAX } from "../src/lib/name-limit";
import { PROGRESS } from "../src/mocks/players";
import { PROFILE } from "../src/mocks/scenes";
import { HOME_VILLAGE } from "../src/mocks/village-v2";
import { expected, masters, problems } from "../scripts/compress-badge-art.ts";

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

/** The ring's three sizes (the season dial's, #856): 96, 108 from 390 px wide, 144 from `tablet`. */
const BOXES = [96, 108, 144];

describe("the badge's art (the owner's direction of 2026-10-31)", () => {
  it("ships each part as a WebP of its size, from a master on the part's frame (scripts/compress-badge-art.ts)", () => {
    expect(masters()).toEqual(["bar.webp", "plate-cap.webp", "plate-tile.webp", "ring.webp", "shield.webp"]);
    expect(expected()).toHaveLength(9);
    expect(problems()).toEqual([]);
    // The ring and the bar share their square frame, so they lie one over the other; the plate's tile and cap share their height.
    expect([BADGE_ART.ring.width, BADGE_ART.ring.height]).toEqual([BADGE_ART.bar.width, BADGE_ART.bar.height]);
    expect(BADGE_ART["plate-tile"].height).toBe(BADGE_ART["plate-cap"].height);
  });

  it("points each image at the smallest copy that stays sharp for the size shown", () => {
    expect(badgeArtSources("ring", 96)).toEqual({
      src: "/badge-art/ring/432.webp",
      srcSet: "/badge-art/ring/192.webp 192w, /badge-art/ring/288.webp 288w, /badge-art/ring/432.webp 432w",
      sizes: "96px",
    });
    expect(badgeArtUrl("plate-tile", 160)).toBe("/badge-art/plate-tile/160.webp");
    // An SVG image takes no srcSet: the bar's larger copy from the 144 px ring.
    expect(BOXES.map(barUrl)).toEqual(["/badge-art/bar/288.webp", "/badge-art/bar/288.webp", "/badge-art/bar/432.webp"]);
  });
});

describe("the level's bar", () => {
  it("runs in the groove a whole turn clockwise from 12 o'clock, under the shield, back to it", () => {
    const r = BAR_RADIUS * 96;
    const { d, c, length } = levelArc(96, r);
    expect(c).toBe(48);
    // From the top down the right side to the bottom, then up the left side to the top (sweep 1: clockwise on the screen).
    expect(d).toBe(`M 48 ${48 - r} A ${r} ${r} 0 0 1 48 ${48 + r} A ${r} ${r} 0 0 1 48 ${48 - r}`);
    expect(length).toBeCloseTo(2 * Math.PI * r);
    // Its bright core in the groove; its glow, over the groove's edges, inside the ring's box. The portrait under the groove.
    expect(BAR_RADIUS - BAR_CORE / 2).toBeGreaterThan(GROOVE.inner);
    expect(BAR_RADIUS + BAR_CORE / 2).toBeLessThan(GROOVE.outer);
    expect(BAR_RADIUS + BAR_BAND / 2).toBeLessThan(0.5);
    expect(PORTRAIT / 2).toBeGreaterThan(GROOVE.inner);
    expect(PORTRAIT / 2).toBeLessThan(BAR_RADIUS);
  });

  it("lays the share on the course: a quarter of it is 3 o'clock, half the bottom, all of it the top again", () => {
    const r = BAR_RADIUS * 96;
    const at = (share: number) => arcPoint(share, 96, r);
    const near = (p: { x: number; y: number }, x: number, y: number) => {
      expect(p.x).toBeCloseTo(x);
      expect(p.y).toBeCloseTo(y);
    };
    near(at(0), 48, 48 - r);
    near(at(0.25), 48 + r, 48);
    near(at(0.5), 48, 48 + r);
    near(at(0.75), 48 - r, 48);
    near(at(1), 48, 48 - r);
    expect(at(2)).toEqual(at(1));
  });

  it("is given the art's measures by the badge: the bar's image, radius and band, the level in the shield's face", () => {
    expect(levelBar(96)).toEqual({ src: "/badge-art/bar/288.webp", radius: BAR_RADIUS * 96, band: BAR_BAND * 96, levelY: expect.any(Number) });
    // The face's centre, inside the shield, which starts above the ring's box.
    for (const box of BOXES) {
      expect(levelBar(box).levelY).toBeGreaterThan(-SHIELD_RISE * box);
      expect(levelBar(box).levelY).toBeLessThan((SHIELD_HEIGHT - SHIELD_RISE) * box);
    }
  });

  it("draws the glowing ring's image through a mask of the course, round at both ends", async () => {
    const { container } = render(wrap(<LevelRing progress={PROGRESS.partWay} box={96} bar={levelBar(96)} />));
    const svg = container.querySelector("[data-slot=level-bar]")!;
    const image = svg.querySelector("image")!;
    expect(image.getAttribute("href")).toBe("/badge-art/bar/288.webp");
    const mask = svg.querySelector(image.getAttribute("mask")!.replace(/^url\((.*)\)$/, "$1"))!;
    const fill = mask.querySelector("[data-slot=level-fill]")!;
    expect(fill.getAttribute("d")).toBe(levelArc(96, BAR_RADIUS * 96).d);
    expect(fill.getAttribute("stroke-linecap")).toBe("round");
    expect(Number(fill.getAttribute("stroke-width"))).toBeCloseTo(BAR_BAND * 96);
    expect(fill.getAttribute("stroke")).toBe("white");
  });

  it("puts the level in the shield's face, in figures that read (12 px at least); nothing while the XP is read", () => {
    for (const box of BOXES) expect(levelFont(box)).toBeGreaterThanOrEqual(12);
    expect(levelText(3)).toBe("3");
    expect(levelText(99)).toBe("99");
    expect(levelText(1_234)).toBe("99+");
    expect(levelText(undefined)).toBe("");
    const { container } = render(wrap(<LevelRing progress={undefined} box={96} bar={levelBar(96)} />));
    expect(container.querySelector("[data-slot=level]")).toHaveTextContent(/^$/);
  });
});

describe("the badge's layout", () => {
  it("rises the shield above the ring and centres the plate, half the ring's height, on it", () => {
    for (const box of BOXES) {
      const { rise, plate, plateTop, shield } = badgeLayout(box);
      expect(rise).toBe(Math.round(SHIELD_RISE * box));
      expect(plate).toBe(Math.round(box / 2));
      expect(plateTop + plate / 2).toBeCloseTo(rise + box / 2, 0);
      expect(shield).toBe(Math.round(0.3 * box));
    }
    expect(BOXES.map((b) => badgeLayout(b).cap)).toEqual([33, 37, 50]);
  });

  it("the name's size: its own while the plate stays within its room, else smaller, never under 12 px", () => {
    expect(nameSize("Al", 96)).toBe(16);
    expect(nameSize("Al", 144)).toBe(20);
    expect(nameSize("bal7hazar", 96)).toBe(16);
    // The longest name (15 characters) a little smaller beside the phones' rings, at its own size beside the 144 px one.
    expect(BOXES.map((b) => nameSize("A".repeat(PLAYER_NAME_MAX), b))).toEqual([13, 15, 20]);
    expect(PLAYER_NAME_MAX).toBe(15);
    expect(NAME_ROOM).toBe(1.05);
    // A name past the limit (the stress mock's) never under 12 px; the ellipsis cuts it.
    expect(nameSize("stonemaster_of_the_long_roads31", 96)).toBe(12);
  });
});

describe("PlayerBadge (#787, redrawn after the owner's direction of 2026-10-31)", () => {
  it("names the level and the XP left; the ring, the portrait in it, the shield with the level, the name on the plate", async () => {
    const { container } = render(badge(value()));
    const profile = screen.getByRole("button", { name: "Profile: bal7hazar, level 3, 180 XP to level 4" });
    const name = within(profile).getByText("bal7hazar");
    expect(name).toHaveClass("font-display", "truncate", "text-outline");
    expect(name).toHaveAttribute("title", "bal7hazar");
    expect(name.style.fontSize).toBe("16px");
    // The ring at the season dial's size (#856), the shield rising 8 px above it; the button the ring's box and the shield.
    const ring = profile.querySelector<HTMLElement>("[data-slot=avatar-ring]")!;
    expect(ring.className).toContain("size-24");
    expect(ring.className).toContain("min-[24.375rem]:size-27");
    expect(ring.className).toContain("tablet:size-36");
    expect(ring.style.top).toBe("8px");
    expect(profile.style.height).toBe("104px");
    expect(profile.querySelector("img[data-slot=ring]")).toHaveAttribute("sizes", "96px");
    // The portrait under the ring, a little wider than its hole.
    const portrait = profile.querySelector("[data-slot=player-avatar]")!.parentElement!;
    expect(parseFloat(portrait.style.inset)).toBeCloseTo(((1 - PORTRAIT) / 2) * 96);
    // The plate from the ring's middle, half its height, centred on it; the tile repeated from the cap leftward.
    expect(profile.style.paddingLeft).toBe("48px");
    const plate = profile.querySelector<HTMLElement>("[data-slot=name-plate]")!;
    expect([plate.style.height, plate.style.marginTop]).toEqual(["48px", "32px"]);
    const face = profile.querySelector<HTMLElement>("[data-slot=name-face]")!;
    expect(face.style.backgroundImage).toBe('url("/badge-art/plate-tile/160.webp")');
    expect(face).toHaveClass("bg-repeat-x", "bg-right");
    expect(face.style.paddingLeft).toBe("52px");
    expect(plate.querySelector("img[data-slot=name-cap]")).toHaveAttribute("src", "/badge-art/plate-cap/160.webp");
    // Within the home's room beside its balances; elsewhere (a story at 320 px) within the width it is given.
    expect(profile).toHaveClass("max-w-[var(--profile-room,100%)]");
    expect(profile.querySelector("img[data-slot=shield]")).not.toBeNull();
    await waitFor(() => expect(profile.querySelector("[data-slot=level-bar]")).not.toBeNull());
    expect(profile.querySelector("[data-slot=level]")).toHaveTextContent(/^3$/);
    expect(profile).not.toHaveTextContent("XP to Lv");
    expect(screen.queryByRole("button", { name: /^League/ })).toBeNull();
    expect(container.querySelector("[data-slot=league-border]")).toBeNull();
  });

  it("the plate grows with the name: the longest name, 15 characters, a little smaller beside the phone's ring", () => {
    render(badge(value({ state: named("CobblestoneKing") })));
    const name = screen.getByText("CobblestoneKing");
    expect(name.style.fontSize).toBe("13px");
  });

  it("at the cap, max level in the name, 20 in the shield (with the bar's chunk)", async () => {
    render(badge(value({ progress: PROGRESS.maxLevel })));
    const profile = screen.getByRole("button", { name: "Profile: bal7hazar, level 20, max level" });
    await waitFor(() => expect(profile.querySelector("[data-slot=level]")).toHaveTextContent(/^20$/));
  });

  it("the badge opens the profile sheet", async () => {
    render(badge(value()));
    await userEvent.click(screen.getByRole("button", { name: /^Profile: bal7hazar/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("a guest: the silhouette in the ring and Guest on the plate, no bar, no shield; without the shell's profile, nothing", () => {
    const { container, rerender } = render(badge(value({ state: PROFILE.guest, progress: undefined })));
    expect(screen.getByRole("button", { name: "Profile: guest" })).toHaveTextContent("Guest");
    expect(container.querySelector("img[data-slot=ring]")).not.toBeNull();
    expect(container.querySelector("[data-slot=level-bar]")).toBeNull();
    expect(container.querySelector("img[data-slot=shield]")).toBeNull();
    rerender(badge(null));
    expect(container.querySelector("[data-slot=player-badge]")).toBeNull();
  });

  it("while the wallet looks: the placeholder in the ring, no plate", () => {
    const { container } = render(badge(value({ state: PROFILE.loading, progress: undefined })));
    expect(container.querySelector("[data-slot=skeleton]")).not.toBeNull();
    expect(container.querySelector("[data-slot=name-plate]")).toBeNull();
  });

  it("is the home's top left; under it the League control, then the village score (#829)", async () => {
    const { container } = render(wrap(<ProfileProvider value={value()}><HomeVillageScene {...HOME_VILLAGE.view} /></ProfileProvider>));
    // The League control in its own chunk (FIRST-LOAD): a stand-in of its height until it comes.
    await screen.findByRole("button", { name: /^League: / });
    const corner = container.querySelector<HTMLElement>("[data-slot=player-badge]")!;
    expect(within(corner).getByRole("button", { name: /^Profile: bal7hazar, level 3/ })).toBeInTheDocument();
    // The column under the profile: the League control, then the village score.
    const column = screen.getByRole("button", { name: /^League: / }).parentElement!;
    const [league, score] = [...column.children] as HTMLElement[];
    expect(league).toHaveAccessibleName(/^League: /);
    expect(score).toHaveAttribute("data-slot", "village-score");
    expect(container.querySelector("[data-slot=xp-ring]")).toBeNull();
  });
});
