import { statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UiIcon } from "../src/components/elements/ui-icon";
import { FRAME_ART, ICON_FRAME, UI_FRAMES, UI_ICONS, uiFrameSources, uiIconSources } from "../src/components/elements/ui-art";
import { MEDALLION_FRAME, MISSION_PARTS, UI_MEDALLIONS, UI_MISSION_PARTS, UI_RINGS, medallionSources, RAIL_GRAIN, missionPartImage, missionPartSources, missionRail } from "../src/components/elements/medallion-art";
import { PILES, RARITY_END, SHOP_PARTS, UI_SHOP_PARTS, shopPartImage, shopPartSources } from "../src/components/elements/shop-art";
import { FRIENDS_PARTS, GOLD_PILL_END, UI_FRIENDS_PARTS, friendsPartImage } from "../src/components/elements/friends-art";
import { EMBLEM_FRAME, GUILD_EMBLEM_CHARGES, emblemChargeMask } from "../src/components/elements/emblem-art";
import { MODE_ICONS, MODE_ICON_FRAME, MODE_SCENES, MODE_SCENE_FRAME, STAKE_ART, STAKE_ART_FRAME, modeIconSources, modeSceneSources, stakeArtName, stakeArtSources } from "../src/components/elements/play-art";
import { AVATAR_ART, AVATAR_ART_FRAME, avatarArtSources } from "../src/components/elements/avatar-art";
import { VAULT_ART, VAULT_ART_FRAME, VAULT_LIGHTS, VAULT_LIGHT_FRAME, vaultArtSources } from "../src/components/elements/vault-art";
import { RANKING_ART, RANKING_ART_FRAME, rankingArtSources } from "../src/components/elements/ranking-art";
import { RADAR_ART, RADAR_FRAME, attackArtSources } from "../src/components/elements/attack-art";
import { GUILD_EMBLEM_ICONS } from "@paved/game-core";
import { expected, masters, OUT, problems } from "../scripts/compress-ui-art.ts";

describe("the HUD's images (the owner's mobile direction of 2026-11-01)", () => {
  it("ships each icon and frame as a WebP of its size, from a master on its frame (scripts/compress-ui-art.ts)", () => {
    expect(masters()).toHaveLength(UI_ICONS.length + UI_FRAMES.length + UI_MEDALLIONS.length + UI_RINGS.length + UI_MISSION_PARTS.length + UI_SHOP_PARTS.length + UI_FRIENDS_PARTS.length + GUILD_EMBLEM_CHARGES.length + MODE_ICONS.length + MODE_SCENES.length + STAKE_ART.length + VAULT_ART.length + VAULT_LIGHTS.length + AVATAR_ART.length + RANKING_ART.length + RADAR_ART.length);
    expect(problems()).toEqual([]);
    // Small: about 2 KiB an icon at 64 px, 5 KiB at 128 (a screen loads a few); two copies an image.
    const parts = UI_MISSION_PARTS.reduce((sum, name) => sum + MISSION_PARTS[name].sizes.length, 0);
    expect(expected()).toHaveLength(2 * UI_ICONS.length + 2 * UI_FRAMES.length + 2 * (UI_MEDALLIONS.length + UI_RINGS.length) + parts + 2 * UI_SHOP_PARTS.length + 2 * UI_FRIENDS_PARTS.length + 2 * GUILD_EMBLEM_CHARGES.length + 2 * MODE_ICONS.length + 2 * MODE_SCENES.length + 2 * STAKE_ART.length + 2 * VAULT_ART.length + 2 * VAULT_LIGHTS.length + 2 * AVATAR_ART.length + 2 * RANKING_ART.length + 2 * RADAR_ART.length);
    const size = (f: string) => statSync(join(OUT, f)).size;
    const hud = expected().filter((f) => !f.startsWith("medallions/") && !f.startsWith("missions/") && !f.startsWith("shop/") && !f.startsWith("friends/") && !f.startsWith("emblems/") && !f.startsWith("play/") && !f.startsWith("vault/") && !f.startsWith("avatar/") && !f.startsWith("ranking/") && !f.startsWith("attack/"));
    // GUILD-PAGE (2026-11-05): raised by exactly the measured growth over main, the copies of the guild's icons (each in line with the
    // others): 39,462 bytes for the guild's menu and a member's view (invite-player, find, leave, disband, promote, demote), 29,790
    // for the join types, the members and the new ranks (unlock, letter, members, sprout, medal), 14,600 for Post's pencil and the
    // log's door and removed member (pencil, joined, kicked); its pin is the chat's. EDIT-VILLAGE (2026-11-06): raised by exactly the
    // measured size of edit mode's copies, 40,932 bytes: the die, the bubble's Rotate, Back to the inventory and Cancel, the Layouts'
    // padlock, the bar's Save and Erase (64 and 128 px each) and Use's gold pill (the frame `save-pill`, 48 and 128 px).
    // SETTINGS-PAGE (2026-11-06): raised by exactly the copies of the Settings' eight row icons (graphics, ambient, skins, music,
    // sound, tile-preview, highlight, grid), 49,176 bytes. PLAY-PAGE (2026-11-06): raised by exactly the measured size of its icons'
    // copies (64 and 128 px): 6,970 bytes for the open gift (`gift-open`), 42,700 for the stake's burned coin, Vault, referral, top
    // win and break even (`flow-burn`, `flow-vault`, `flow-referral`, `max-gain`: 31,500; `break-even`: 11,200), 8,392 for the
    // split's coin and arrows (`money-flow`), 8,196 for the stake's money bag (`stake`). ATTACK-SCOUT (2026-11-07): raised by exactly
    // the copies of the pile of tiles (`tile-stack`, the scout's deck and the home's Tiles, 64 and 128 px), 8,034 bytes. TILE-ACTIONS
    // (2026-11-07): raised by exactly the measured growth, 15,184 bytes: the copies of the tile's painted actions (`tile-cancel`,
    // `tile-discard`, `tile-rotate`, `tile-confirm`, `tile-return`, 64 and 128 px), 32,254 bytes, less those of edit mode's bubble's bare
    // Rotate, Back to the inventory and Cancel (`rotate-tile`, `to-inventory`, `cancel`), 17,070, which left with it. STAR-ART
    // (2026-11-07): lowered by exactly the measured change, 406 bytes: the star's copies, redrawn clean (`star`, 64 px 1,890 to 1,880,
    // 128 px 3,956 to 3,560). STORY-INTRO (2026-11-07): raised by exactly the copies of a Story level's tip's painted bulb (`bulb`, 64
    // and 128 px), 4,892 bytes. GAME-OVERLAY (2026-11-07): raised by exactly the copies of the overlay's paintings (64 and 128 px):
    // Story's Restart (`restart`), the timer (`countdown`), Surrender (`surrender`) and a notice's warning (`caution`), 25,208 bytes.
    // PLAY-REWARDS (2026-11-08): lowered by exactly the open gift's copies (`gift-open`, 64 and 128 px), 6,970 bytes, which left with it.
    // PRESS-BUILD (2026-11-08): raised by exactly the copies of the long press's painted Edit village (`tile-edit`, 64 and 128 px),
    // 5,844 bytes.
    expect(hud.reduce((sum, f) => sum + size(f), 0)).toBeLessThan(400 * 1024 + 39_462 + 29_790 + 14_600 + 40_932 + 49_176 + 6_970 + 42_700 + 8_392 + 8_196 + 8_034 + 15_184 - 406 + 4_892 + 25_208 - 6_970 + 5_844);
  });

  it("ships the ranking's gold and silver medals (LEADERBOARD-PAGE): the icons' frame, two light copies each", () => {
    expect(RANKING_ART_FRAME).toMatchObject({ width: 256, height: 256, sizes: [64, 128] });
    // Measured on 2026-11-07: 2.1 and 1.7 KiB at 64 px, 4.7 and 4.0 KiB at 128 px (gold, silver; the bronze `medal`'s 1.9 and 4.2).
    for (const name of RANKING_ART) for (const s of RANKING_ART_FRAME.sizes) expect(statSync(join(OUT, "ranking", String(s), `${name}.webp`)).size, name).toBeLessThan(s === 128 ? 6 * 1024 : 3 * 1024);
    expect(rankingArtSources("medal-gold", 28)).toEqual({
      src: "/ui-art/ranking/128/medal-gold.webp",
      srcSet: "/ui-art/ranking/64/medal-gold.webp 64w, /ui-art/ranking/128/medal-gold.webp 128w",
      sizes: "28px",
      width: 256,
      height: 256,
    });
  });

  it("ships the guild emblems' charges (GUILD-PAGE): as many as game-core's emblems, each a light mask", () => {
    expect(GUILD_EMBLEM_CHARGES).toHaveLength(GUILD_EMBLEM_ICONS);
    expect(new Set(GUILD_EMBLEM_CHARGES).size).toBe(GUILD_EMBLEM_CHARGES.length);
    expect(EMBLEM_FRAME).toMatchObject({ width: 256, height: 256, sizes: [64, 128] });
    for (const name of GUILD_EMBLEM_CHARGES) for (const s of EMBLEM_FRAME.sizes) expect(statSync(join(OUT, "emblems", String(s), `${name}.webp`)).size, name).toBeLessThan(s === 128 ? 5 * 1024 : 2 * 1024);
    expect(emblemChargeMask("wolf")).toBe('image-set(url("/ui-art/emblems/64/wolf.webp") 1x, url("/ui-art/emblems/128/wolf.webp") 2x)');
  });

  it("ships the Play page's mode icons and scenes (PLAY-MODES): one of each per mode, two copies each", () => {
    expect(MODE_ICONS).toEqual(["mode-attack", "mode-challenge", "mode-training", "mode-story", "mode-puzzle"]);
    expect(MODE_SCENES).toEqual(["scene-attack", "scene-challenge", "scene-training", "scene-story", "scene-puzzle", "scene-joust", "scene-colossus"]);
    expect(MODE_ICON_FRAME).toMatchObject({ width: 256, height: 256, sizes: [128, 256] });
    expect(MODE_SCENE_FRAME).toMatchObject({ width: 960, height: 640, sizes: [400, 800] });
    // Measured on 2026-11-08: the icons 3.9 to 5.4 KiB at 128 px, 9.3 to 12.6 KiB at 256 px; the scenes 23.8 to 52.9 KiB at 400 px,
    // 67.1 to 165.3 KiB at 800 px (the Puzzle's grid of towns the heaviest).
    for (const name of MODE_ICONS) for (const s of MODE_ICON_FRAME.sizes) expect(statSync(join(OUT, "play", String(s), `${name}.webp`)).size, name).toBeLessThan(s === 256 ? 16 * 1024 : 7 * 1024);
    for (const name of MODE_SCENES) for (const s of MODE_SCENE_FRAME.sizes) expect(statSync(join(OUT, "play", String(s), `${name}.webp`)).size, name).toBeLessThan(s === 800 ? 200 * 1024 : 64 * 1024);
    expect(modeIconSources("story", 92)).toEqual({
      src: "/ui-art/play/256/mode-story.webp",
      srcSet: "/ui-art/play/128/mode-story.webp 128w, /ui-art/play/256/mode-story.webp 256w",
      sizes: "92px",
      width: 256,
      height: 256,
    });
    expect(modeSceneSources("puzzle", 357.5)).toEqual({
      src: "/ui-art/play/800/scene-puzzle.webp",
      srcSet: "/ui-art/play/400/scene-puzzle.webp 400w, /ui-art/play/800/scene-puzzle.webp 800w",
      sizes: "358px",
      width: 960,
      height: 640,
    });
  });

  it("ships the stake's paintings (PLAY-PAGE): one per stake, one 3:2 frame, two copies each, light", () => {
    expect(STAKE_ART).toHaveLength(10);
    expect(STAKE_ART_FRAME).toMatchObject({ width: 384, height: 256, sizes: [192, 384] });
    // Measured on 2026-11-06 (the first sheet's piles): 2.3 to 7.8 KiB at 192 px, 5.6 to 20.2 KiB at 384 px (the twenty coins the heaviest).
    for (const name of STAKE_ART) for (const s of STAKE_ART_FRAME.sizes) expect(statSync(join(OUT, "play", String(s), `${name}.webp`)).size, name).toBeLessThan(s === 384 ? 26 * 1024 : 10 * 1024);
    // A stake out of range takes the nearest end's.
    expect([stakeArtName(0), stakeArtName(3), stakeArtName(11)]).toEqual(["stake-1", "stake-3", "stake-10"]);
    expect(stakeArtSources(6, 192)).toEqual({
      src: "/ui-art/play/384/stake-6.webp",
      srcSet: "/ui-art/play/192/stake-6.webp 192w, /ui-art/play/384/stake-6.webp 384w",
      sizes: "192px",
      width: 384,
      height: 256,
    });
  });

  it("ships the search's radar (ATTACK-SCOUT): the dish and its sweep, out of the HUD's total, light", () => {
    expect(RADAR_FRAME).toMatchObject({ width: 512, height: 512, sizes: [192, 384] });
    // Measured on 2026-11-07: the dish 8.2 and 19.7 KiB, the sweep 4.1 and 11.6 KiB.
    for (const name of RADAR_ART) for (const s of RADAR_FRAME.sizes) expect(statSync(join(OUT, "attack", String(s), `${name}.webp`)).size, name).toBeLessThan(s === 384 ? 24 * 1024 : 10 * 1024);
    expect(attackArtSources("radar", 176)).toEqual({
      src: "/ui-art/attack/384/radar.webp",
      srcSet: "/ui-art/attack/192/radar.webp 192w, /ui-art/attack/384/radar.webp 384w",
      sizes: "176px",
      width: 512,
      height: 512,
    });
  });

  it("ships the avatar editor's paintings (AVATAR-PAGE): one a trait but Headwear (the HUD's crown), and Undo, on the icons' frame, each copy light", () => {
    // Nine traits (Headwear is the HUD's crown) and the foot's Undo.
    expect(AVATAR_ART).toHaveLength(10);
    expect(AVATAR_ART).not.toContain("headwear");
    expect(AVATAR_ART).toContain("undo");
    expect(AVATAR_ART_FRAME).toMatchObject({ width: ICON_FRAME.width, height: ICON_FRAME.height, sizes: [48, 96] });
    for (const name of AVATAR_ART) for (const s of AVATAR_ART_FRAME.sizes) expect(statSync(join(OUT, "avatar", String(s), `${name}.webp`)).size, name).toBeLessThan(s === 96 ? 5 * 1024 : 2 * 1024);
    expect(avatarArtSources("beard", 36)).toEqual({ src: "/ui-art/avatar/96/beard.webp", srcSet: "/ui-art/avatar/48/beard.webp 48w, /ui-art/avatar/96/beard.webp 96w", sizes: "36px" });
  });

  it("ships the Vault's icons (VAULT-PAGE) apart from the HUD's: Deposit, Withdraw and the exit fee, on the icons' frame, each copy light", () => {
    expect(VAULT_ART_FRAME).toMatchObject({ width: ICON_FRAME.width, height: ICON_FRAME.height, sizes: ICON_FRAME.sizes });
    for (const name of VAULT_ART) for (const s of VAULT_ART_FRAME.sizes) expect(statSync(join(OUT, "vault", String(s), `${name}.webp`)).size, name).toBeLessThan(s === 128 ? 7 * 1024 : 3 * 1024);
    // The vPAVED coin's silver light, two layers (VAULT-PAGE, the owner's ask of 2026-11-07): measured 7.6 to 10.9 KiB at 160 px,
    // 22.4 to 36.0 KiB at 320 px.
    expect(VAULT_LIGHT_FRAME).toMatchObject({ width: 512, height: 512, sizes: [160, 320] });
    for (const name of VAULT_LIGHTS) for (const s of VAULT_LIGHT_FRAME.sizes) expect(statSync(join(OUT, "vault", String(s), `${name}.webp`)).size, name).toBeLessThan(s === 320 ? 40 * 1024 : 14 * 1024);
    expect(vaultArtSources("deposit", 32)).toEqual({ src: "/ui-art/vault/128/deposit.webp", srcSet: "/ui-art/vault/64/deposit.webp 64w, /ui-art/vault/128/deposit.webp 128w", sizes: "32px" });
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

  it("ships the milestones' painted pieces (MISSIONS-PAGE) light; the rails repeat their painting's middle, round at the ends (RAILS)", () => {
    const total = UI_MISSION_PARTS.flatMap((name) => MISSION_PARTS[name].sizes.map((s) => statSync(join(OUT, "missions", String(s), `${name}.webp`)).size)).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(64 * 1024);
    // The rail 10 px tall: its tile at its painting's aspect, RAIL_GRAIN times narrower, repeated from the bar's start; never stretched.
    expect(missionRail("rail-fill", 10)).toMatchObject({ height: 10, minWidth: 10, borderRadius: 9999, backgroundSize: `${((1313 * 10) / 17 / RAIL_GRAIN).toFixed(1)}px 100%`, backgroundRepeat: "repeat-x", backgroundPosition: "0 50%" });
    expect(MISSION_PARTS["rail-track"]).toMatchObject({ width: 1325, height: 12 });
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
        <UiIcon name="guild" size="xl" label="Allegiance" />
      </>,
    );
    const [plain, named] = container.querySelectorAll("img");
    expect(plain).toHaveAttribute("alt", "");
    expect(plain).toHaveAttribute("aria-hidden", "true");
    expect(plain).toHaveAttribute("draggable", "false");
    expect(plain).toHaveAttribute("data-icon", "vault");
    expect(screen.getByRole("img", { name: "Allegiance" })).toBe(named);
    expect(named!.className).toContain("size-12");
    expect(named!.getAttribute("sizes")).toBe("48px");
    expect(container.innerHTML).not.toMatch(/https?:/);
  });
});
