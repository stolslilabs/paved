import { statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UiIcon } from "../src/components/elements/ui-icon";
import { FRAME_ART, ICON_FRAME, UI_FRAMES, UI_ICONS, uiFrameSources, uiIconSources } from "../src/components/elements/ui-art";
import { MEDALLION_FRAME, MISSION_PARTS, UI_MEDALLIONS, UI_MISSION_PARTS, UI_RINGS, medallionSources, missionPartImage, missionPartSlice, missionPartSources } from "../src/components/elements/medallion-art";
import { PILES, RARITY_END, SHOP_PARTS, UI_SHOP_PARTS, shopPartImage, shopPartSources } from "../src/components/elements/shop-art";
import { FRIENDS_PARTS, GOLD_PILL_END, UI_FRIENDS_PARTS, friendsPartImage } from "../src/components/elements/friends-art";
import { EMBLEM_FRAME, GUILD_EMBLEM_CHARGES, emblemChargeMask } from "../src/components/elements/emblem-art";
import { GUILD_EMBLEM_ICONS } from "@paved/game-core";
import { expected, masters, OUT, problems } from "../scripts/compress-ui-art.ts";

describe("the HUD's images (the owner's mobile direction of 2026-11-01)", () => {
  it("ships each icon and frame as a WebP of its size, from a master on its frame (scripts/compress-ui-art.ts)", () => {
    expect(masters()).toHaveLength(UI_ICONS.length + UI_FRAMES.length + UI_MEDALLIONS.length + UI_RINGS.length + UI_MISSION_PARTS.length + UI_SHOP_PARTS.length + UI_FRIENDS_PARTS.length + GUILD_EMBLEM_CHARGES.length);
    expect(problems()).toEqual([]);
    // Small: about 2 KiB an icon at 64 px, 5 KiB at 128 (a screen loads a few); two copies an image.
    const parts = UI_MISSION_PARTS.reduce((sum, name) => sum + MISSION_PARTS[name].sizes.length, 0);
    expect(expected()).toHaveLength(2 * UI_ICONS.length + 2 * UI_FRAMES.length + 2 * (UI_MEDALLIONS.length + UI_RINGS.length) + parts + 2 * UI_SHOP_PARTS.length + 2 * UI_FRIENDS_PARTS.length + 2 * GUILD_EMBLEM_CHARGES.length);
    const size = (f: string) => statSync(join(OUT, f)).size;
    const hud = expected().filter((f) => !f.startsWith("medallions/") && !f.startsWith("missions/") && !f.startsWith("shop/") && !f.startsWith("friends/") && !f.startsWith("emblems/"));
    // GUILD-PAGE (2026-11-05): raised by exactly the measured growth over main, the copies of the guild's icons (each in line with the
    // others): 39,462 bytes for the guild's menu and a member's view (invite-player, find, leave, disband, promote, demote), 29,790
    // for the join types, the members and the new ranks (unlock, letter, members, sprout, medal), 14,600 for Post's pencil and the
    // log's door and removed member (pencil, joined, kicked); its pin is the chat's.
    expect(hud.reduce((sum, f) => sum + size(f), 0)).toBeLessThan(400 * 1024 + 39_462 + 29_790 + 14_600);
  });

  it("ships the guild emblems' charges (GUILD-PAGE): as many as game-core's emblems, each a light mask", () => {
    expect(GUILD_EMBLEM_CHARGES).toHaveLength(GUILD_EMBLEM_ICONS);
    expect(new Set(GUILD_EMBLEM_CHARGES).size).toBe(GUILD_EMBLEM_CHARGES.length);
    expect(EMBLEM_FRAME).toMatchObject({ width: 256, height: 256, sizes: [64, 128] });
    for (const name of GUILD_EMBLEM_CHARGES) for (const s of EMBLEM_FRAME.sizes) expect(statSync(join(OUT, "emblems", String(s), `${name}.webp`)).size, name).toBeLessThan(s === 128 ? 5 * 1024 : 2 * 1024);
    expect(emblemChargeMask("wolf")).toBe('image-set(url("/ui-art/emblems/64/wolf.webp") 1x, url("/ui-art/emblems/128/wolf.webp") 2x)');
  });

  it("ships the friends page's pieces (FRIENDS-PAGE): two icons and the gold pill, 3-sliced, its ends under half its width, each copy light", () => {
    for (const name of UI_FRIENDS_PARTS) for (const s of FRIENDS_PARTS[name].sizes) expect(statSync(join(OUT, "friends", String(s), `${name}.webp`)).size, name).toBeLessThan(name === "gold-pill" ? 4 * 1024 : 12 * 1024);
    expect(GOLD_PILL_END * 2).toBeLessThan(FRIENDS_PARTS["gold-pill"].width);
    expect(friendsPartImage("gold-pill")).toBe('image-set(url("/ui-art/friends/32/gold-pill.webp") 1x, url("/ui-art/friends/64/gold-pill.webp") 2x)');
  });

  it("ships the Shop's pieces (SHOP-PAGE): the rarity pills, 3-sliced, and a pile a pack, each copy light", () => {
    for (const name of UI_SHOP_PARTS) for (const s of SHOP_PARTS[name].sizes) expect(statSync(join(OUT, "shop", String(s), `${name}.webp`)).size, name).toBeLessThan(12 * 1024);
    // A pill's rounded ends are under half its width: the middle stretches, the ends never do.
    for (const rarity of ["common", "uncommon", "mythic"] as const) expect(RARITY_END[rarity] * 2).toBeLessThan(SHOP_PARTS[`rarity-${rarity}`].width);
    expect(shopPartImage("rarity-mythic")).toBe('image-set(url("/ui-art/shop/22/rarity-mythic.webp") 1x, url("/ui-art/shop/44/rarity-mythic.webp") 2x)');
    expect(PILES).toHaveLength(4);
    expect(shopPartSources("pile-4", 136)).toEqual({
      src: "/ui-art/shop/256/pile-4.webp",
      srcSet: "/ui-art/shop/128/pile-4.webp 128w, /ui-art/shop/256/pile-4.webp 256w",
      sizes: "136px",
      width: 256,
      height: 160,
    });
  });

  it("ships the missions' paintings and rings (MISSIONS-PAGE) on one round frame, each copy light: under 16 KiB at 192 px, 8 KiB at 96", () => {
    expect(MEDALLION_FRAME).toMatchObject({ width: 256, height: 256, sizes: [96, 192] });
    expect(new Set(UI_MEDALLIONS).size).toBe(UI_MEDALLIONS.length);
    for (const name of [...UI_MEDALLIONS, ...UI_RINGS]) {
      expect(statSync(join(OUT, "medallions", "192", `${name}.webp`)).size, name).toBeLessThan(16 * 1024);
      expect(statSync(join(OUT, "medallions", "96", `${name}.webp`)).size, name).toBeLessThan(8 * 1024);
    }
    // The 88 px card on a 2x screen takes the 192 px copy, a 64 px medallion on a 1x screen the 96 px one.
    expect(medallionSources("hammer", 88)).toEqual({
      src: "/ui-art/medallions/192/hammer.webp",
      srcSet: "/ui-art/medallions/96/hammer.webp 96w, /ui-art/medallions/192/hammer.webp 192w",
      sizes: "88px",
    });
  });

  it("ships the milestones' painted pieces (MISSIONS-PAGE) light, the 9-slices cut at half their copy's height", () => {
    const total = UI_MISSION_PARTS.flatMap((name) => MISSION_PARTS[name].sizes.map((s) => statSync(join(OUT, "missions", String(s), `${name}.webp`)).size)).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(64 * 1024);
    expect(missionPartSlice("rail-track")).toBe(6);
    expect(missionPartImage("rail-track")).toBe('url("/ui-art/missions/12/rail-track.webp")');
    expect(missionPartImage("orb")).toBe('image-set(url("/ui-art/missions/32/orb.webp") 1x, url("/ui-art/missions/64/orb.webp") 2x)');
    // The done badge, 32 px on the card's medallion: its copies by width, the screen picking one.
    expect(missionPartSources("check-badge", 31.7)).toEqual({
      src: "/ui-art/missions/64/check-badge.webp",
      srcSet: "/ui-art/missions/32/check-badge.webp 32w, /ui-art/missions/64/check-badge.webp 64w",
      sizes: "32px",
    });
  });

  it("puts every icon on one square frame, so any one swaps for another", () => {
    expect(ICON_FRAME).toMatchObject({ width: 256, height: 256 });
    expect(new Set(UI_ICONS).size).toBe(UI_ICONS.length);
    // The frames keep their own shapes: the dock's wood and the XP bar's track and fill wide, the parchment a panel, the medallion
    // round (the mockup's, its rim's knob a few px over its top), the divider a post.
    for (const name of ["dock-wood", "xp-track", "xp-fill"] as const) expect(FRAME_ART[name].width, name).toBeGreaterThan(FRAME_ART[name].height * 3);
    expect(FRAME_ART["dock-panel"].width).toBeGreaterThan(FRAME_ART["dock-panel"].height * 2);
    expect(FRAME_ART["play-medallion"].height / FRAME_ART["play-medallion"].width).toBeCloseTo(1, 1);
    expect(FRAME_ART["dock-divider"].height).toBeGreaterThan(FRAME_ART["dock-divider"].width * 3);
  });

  it("points an image at the smallest copy that stays sharp for the size shown", () => {
    const icon = uiIconSources("chests", 32);
    expect(icon.src).toBe("/ui-art/icons/128/chests.webp");
    expect(icon.srcSet).toBe("/ui-art/icons/64/chests.webp 64w, /ui-art/icons/128/chests.webp 128w");
    expect(icon.sizes).toBe("32px");
    expect(uiFrameSources("xp-track", 240).srcSet).toBe("/ui-art/frames/360/xp-track.webp 360w, /ui-art/frames/720/xp-track.webp 720w");
  });

  it("draws an icon decorative, or named when it is a control's only content", () => {
    const { container } = render(
      <>
        <UiIcon name="vault" />
        <UiIcon name="guild" size="xl" label="Guild" />
      </>,
    );
    const [plain, named] = container.querySelectorAll("img");
    expect(plain).toHaveAttribute("alt", "");
    expect(plain).toHaveAttribute("aria-hidden", "true");
    expect(plain).toHaveAttribute("draggable", "false");
    expect(plain).toHaveAttribute("data-icon", "vault");
    expect(screen.getByRole("img", { name: "Guild" })).toBe(named);
    expect(named!.className).toContain("size-12");
    expect(named!.getAttribute("sizes")).toBe("48px");
    expect(container.innerHTML).not.toMatch(/https?:/);
  });
});
