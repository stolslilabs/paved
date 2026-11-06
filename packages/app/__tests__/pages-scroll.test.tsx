import { render, screen, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BalancesProvider } from "../src/components/containers/balances-context";
import PagePanel from "../src/components/containers/page-panel";
import { CobblesScene } from "../src/components/scenes/cobbles-scene";
import { TilesScene } from "../src/components/scenes/tiles-scene";
import { PlayScene } from "../src/components/scenes/play-scene";
import { PvpLeagueScene } from "../src/components/scenes/pvp-league-scene";
import { MissionsScene } from "../src/components/scenes/missions-scene";
import { ReferralScene } from "../src/components/scenes/referral-scene";
import { SettingsScene } from "../src/components/scenes/settings-scene";
import { ThemeScene } from "../src/components/scenes/theme-scene";
import { VaultScene } from "../src/components/scenes/vault-scene";
import { VillageChestsScene } from "../src/components/scenes/village-chests-scene";
import { PVP_LEAGUE } from "../src/mocks/pvp";
import { COBBLES, MISSIONS, PLAY, REFERRAL, SETTINGS, THEME, TILES, VAULT } from "../src/mocks/scenes";
import { VILLAGE_CHESTS } from "../src/mocks/village-v2";
import { SHOP } from "../src/mocks/shop";
import { ShopScene } from "../src/components/scenes/shop-scene";

/**
 * PAGES-SCROLL (#782, the owner's decisions of 2026-10-26): every page of the bar, the Vault and the second-level pages
 * scroll in one region, below `desktop` (`TabFrame`'s) and in the side panel from it (the panel's body); Missions in the HUD's
 * drawer's body at every width (MISSIONS-PAGE), and Tiles (COLLECTION-PAGE), the Shop (SHOP-PAGE) and Settings with its views
 * (SETTINGS-PAGE). The page is drawn
 * straight in that region: its sticky header and its content are the region's own (no column of its own between them and the
 * region, one viewport tall at least), so the region is the one element that scrolls. jsdom lays nothing out, so this test
 * reads the structure that lets a page scroll, not its overflow: the overflow itself (content taller than a 375 x 812 phone and
 * than the 1440 x 900 panel, scrolled to its last element by a finger and by the wheel) is measured in a real browser by
 * `e2e/pages-scroll.e2e.ts` (`bun run e2e -- pages-scroll`).
 */
const no = () => vi.fn();
const PAGES: readonly [string, ReactNode][] = [
  ["Chests", <VillageChestsScene {...VILLAGE_CHESTS.closed} onBack={no()} onPlay={no()} onOpen={no()} onTake={no()} />],
  ["Vault", <VaultScene {...VAULT.position} />],
  ["Referral", <ReferralScene {...REFERRAL.earned} onBack={no()} />],
];

/**
 * The full-screen flows below `desktop` (Play): no tab frame, the document scrolls under their sticky top bar; from `desktop`
 * pages of the side panel, in its body as every other.
 */
const FLOWS: readonly [string, ReactNode][] = [
  ["Choose a mode", <PlayScene {...PLAY.connected} onBack={no()} onChallenge={no()} onTraining={no()} onStory={no()} onAttack={no()} />],
];

const BALANCES = { state: { status: "ready", usdc: 0n, paved: 0n, cobbles: 640 }, faucet: false, show: { phone: true, desktop: "all" } } as const;

function draw(page: ReactNode, inPanel: boolean, title: string) {
  return render(
    <LazyMotion features={domMax}>
      <BalancesProvider value={BALANCES}>
        {inPanel ? (
          <PagePanel open title={title} onClose={no()}>
            {page}
          </PagePanel>
        ) : (
          page
        )}
      </BalancesProvider>
    </LazyMotion>,
  );
}

/** A class that makes an element scroll, clip or hold a fixed height: none may stand between the region and its page. */
const BOXED = /(^|\s)(overflow-(y-)?(auto|scroll|hidden|clip)|h-full|min-h-full|h-dvh|min-h-dvh|h-screen|min-h-screen)(\s|$)/;

function expectOneRegion(title: string) {
  const regions = document.querySelectorAll<HTMLElement>("[data-slot=page-scroll]");
  expect(regions).toHaveLength(1);
  const region = regions[0]!;
  expect(region.className).toMatch(/(^|\s)overflow-y-auto(\s|$)/);
  expect(region.className).toMatch(/(^|\s)min-h-0(\s|$)/);
  expect(region.className).toContain("overscroll-contain");
  const heading = screen.getByRole("heading", { level: 1, name: title });
  const header = heading.closest<HTMLElement>("[data-slot=page-header]")!;
  expect(region).toContainElement(header);
  // The header sticks to the region's top while the content scrolls.
  expect(header.className).toMatch(/(^|\s)sticky(\s|$)/);
  expect(header.className).toMatch(/(^|\s)top-0(\s|$)/);
  // Nothing between the region and the page boxes it in: the page's height is its content's.
  for (let el = header.parentElement; el && el !== region; el = el.parentElement) expect(el.className).not.toMatch(BOXED);
  // The page's content (its `main`) is the header's sibling, in the same region.
  const main = header.parentElement!.querySelector(":scope > main");
  expect(main).not.toBeNull();
  // No other element of the page scrolls vertically.
  const scrollers = [...region.querySelectorAll<HTMLElement>("*")].filter((el) => /(^|\s)overflow-(y-)?(auto|scroll)(\s|$)/.test(el.getAttribute("class") ?? ""));
  expect(scrollers).toEqual([]);
  return { region, header, main: main as HTMLElement };
}

describe("every page scrolls in one region, its header sticky (#782)", () => {
  it.each(PAGES.map(([title, page], i) => [`${title} (${i})`, title, page] as const))("%s below desktop: the tab frame's region", (_, title, page) => {
    draw(page, false, title);
    const { region } = expectOneRegion(title);
    // The frame is one viewport tall and its region takes what the bar leaves.
    expect(region.parentElement!.className).toMatch(/(^|\s)h-dvh(\s|$)/);
    expect(region.className).toContain("flex-1");
  });

  it.each(PAGES.map(([title, page], i) => [`${title} (${i})`, title, page] as const))("%s from desktop: the side panel's body", (_, title, page) => {
    draw(page, true, title);
    const { region } = expectOneRegion(title);
    expect(screen.getByRole("dialog", { name: title })).toContainElement(region);
    // The phone's bar is not drawn in the panel.
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it.each(FLOWS)("%s from desktop: the side panel's body, the flow's full-screen height dropped", (title, page) => {
    draw(page, true, title);
    expectOneRegion(title);
    expect(screen.getByRole("dialog", { name: title })).toContainElement(document.querySelector<HTMLElement>("[data-slot=page-scroll]"));
  });

  it.each(FLOWS)("%s below desktop: a flow, the document scrolls under its sticky bar (no region, no clipping column)", (title, page) => {
    draw(page, false, title);
    expect(document.querySelector("[data-slot=page-scroll]")).toBeNull();
    const header = screen.getByRole("heading", { level: 1, name: title }).closest<HTMLElement>("[data-slot=page-header]")!;
    expect(header.className).toMatch(/(^|\s)sticky(\s|$)/);
    // Its column fills the viewport at least (`min-h-dvh`) and never clips or scrolls: the document does.
    const column = header.parentElement!;
    expect(column.className).toMatch(/(^|\s)min-h-dvh(\s|$)/);
    for (let el: HTMLElement | null = column; el && el !== document.body; el = el.parentElement)
      expect(el.className).not.toMatch(/(^|\s)(overflow-(y-)?(auto|scroll|hidden|clip)|h-dvh|h-screen|h-full)(\s|$)/);
  });

  it("the Chests draw their content in the region: the day's slots", () => {
    draw(PAGES.find(([title]) => title === "Chests")![1], false, "Chests");
    // The page with the chest modal closed (#784): the day's three slots, under the sticky header.
    const slots = screen.getByRole("list", { name: "Today's PvP slots" });
    expect(document.querySelector("[data-slot=page-scroll]")).toContainElement(slots);
    expect(slots.querySelectorAll(":scope > li")).toHaveLength(3);
  });

  it("the packs' sheet (SHOP-PAGE: the Shop's Cobbles tab over a page) scrolls in the sheet's region", () => {
    draw(<CobblesScene {...COBBLES.referred} onBack={no()} onSelectPack={no()} onBuyPack={no()} />, true, "Cobbles");
    expectOneRegion("Cobbles");
    expect(screen.getByRole("dialog", { name: "Cobbles" })).toContainElement(document.querySelector<HTMLElement>("[data-slot=page-scroll]"));
  });

  it.each([
    ["Settings", <SettingsScene {...SETTINGS.connected} onChange={no()} />, "More"],
    ["Credits", <SettingsScene {...SETTINGS.credits} />, "Music"],
    ["Themes", <SettingsScene {...SETTINGS.connected} view="themes" themes={<ThemeScene {...THEME.mixed} onUse={no()} onOpen={no()} />} />, "Themes"],
  ] as const)("%s (SETTINGS-PAGE) is drawn in the HUD drawer's body, to its last section, nothing else scrolling", (title, page, last) => {
    draw(page, false, title);
    const drawer = screen.getByRole("dialog", { name: title });
    const region = drawer.querySelector<HTMLElement>("[data-hud-drawer-body]")!;
    expect(region.className).toMatch(/(^|\s)overflow-y-auto(\s|$)/);
    expect(region.className).toMatch(/(^|\s)min-h-0(\s|$)/);
    const end = screen.getByRole("region", { name: last });
    expect(region).toContainElement(end);
    const scrollers = [...region.querySelectorAll<HTMLElement>("*")].filter((el) => /(^|\s)overflow-(y-)?(auto|scroll)(\s|$)/.test(el.getAttribute("class") ?? ""));
    expect(scrollers).toEqual([]);
    for (let el: HTMLElement | null = end.parentElement; el && el !== region; el = el.parentElement) expect(el.className).not.toMatch(BOXED);
  });

  it("the Shop (SHOP-PAGE) draws a theme's 19 tiles in the HUD drawer's body, to the last one", () => {
    draw(<ShopScene {...SHOP.forest} onBack={no()} />, false, "Forest");
    const drawer = screen.getByRole("dialog", { name: "Forest" });
    const region = drawer.querySelector<HTMLElement>("[data-hud-drawer-body]")!;
    expect(region.className).toMatch(/(^|\s)overflow-y-auto(\s|$)/);
    expect(region.className).toMatch(/(^|\s)min-h-0(\s|$)/);
    const cells = within(screen.getByRole("list", { name: "Forest tiles" })).getAllByRole("listitem");
    expect(cells).toHaveLength(19);
    expect(region).toContainElement(cells.at(-1)!);
    const scrollers = [...region.querySelectorAll<HTMLElement>("*")].filter((el) => /(^|\s)overflow-(y-)?(auto|scroll)(\s|$)/.test(el.getAttribute("class") ?? ""));
    expect(scrollers).toEqual([]);
    for (let el: HTMLElement | null = cells.at(-1)!.parentElement; el && el !== region; el = el.parentElement) expect(el.className).not.toMatch(BOXED);
  });

  it("the League (#647) draws its carousel, its season and its battle logs in the HUD drawer's body (LEAGUE-PAGE), to the last row", () => {
    draw(<PvpLeagueScene {...PVP_LEAGUE.matchesMany} onBack={no()} onOpenMatch={no()} />, false, "League");
    const drawer = screen.getByRole("dialog", { name: "League" });
    const region = drawer.querySelector<HTMLElement>("[data-hud-drawer-body]")!;
    expect(region.className).toMatch(/(^|\s)overflow-y-auto(\s|$)/);
    expect(region.className).toMatch(/(^|\s)min-h-0(\s|$)/);
    expect(region.className).toContain("overscroll-contain");
    // The carousel of Unranked and the 23 leagues (#785, #917), then the season; no Attack button (#833).
    expect(region).toContainElement(screen.getByRole("region", { name: "Leagues" }));
    expect(screen.getByRole("region", { name: "Leagues" }).querySelectorAll("[data-slot='carousel-item']").length).toBe(24);
    expect(region).toContainElement(screen.getByRole("region", { name: "Season" }));
    expect(screen.queryByRole("button", { name: /^Attack/ })).toBeNull();
    // The latest attacks and defences (#786), a section of the page, in the same region, to its last row and its Show more.
    expect(region).toContainElement(screen.getByRole("heading", { name: "Battle logs" }));
    const rows = within(screen.getByRole("list", { name: "Matches" })).getAllByRole("button");
    expect(region).toContainElement(rows.at(-1)!);
    expect(region).toContainElement(screen.getByRole("button", { name: "Show more" }));
    // The body is the one element that scrolls; no fixed height or clip between the last row and it.
    const scrollers = [...region.querySelectorAll<HTMLElement>("*")].filter((el) => /(^|\s)overflow-(y-)?(auto|scroll)(\s|$)/.test(el.getAttribute("class") ?? ""));
    expect(scrollers).toEqual([]);
    for (let el: HTMLElement | null = rows.at(-1)!.parentElement; el && el !== region; el = el.parentElement) expect(el.className).not.toMatch(BOXED);
  });

  it("Missions (#832) draws its card and its sections of medallions in the HUD drawer's body (MISSIONS-PAGE), to its last one; no part of it takes the finger", () => {
    draw(<MissionsScene {...MISSIONS.daily} onBack={no()} onClaimQuest={no()} onClaimAchievement={no()} />, false, "Missions");
    const drawer = screen.getByRole("dialog", { name: "Missions" });
    const region = drawer.querySelector<HTMLElement>("[data-hud-drawer-body]")!;
    expect(region.className).toMatch(/(^|\s)overflow-y-auto(\s|$)/);
    expect(region.className).toMatch(/(^|\s)min-h-0(\s|$)/);
    expect(region.className).toContain("overscroll-contain");
    expect(region).toContainElement(screen.getByRole("region", { name: "Selected mission" }));
    expect(region).toContainElement(screen.getByRole("region", { name: /^Daily/ }));
    expect(region).toContainElement(screen.getByRole("region", { name: /^Weekly/ }));
    const lifetime = screen.getByRole("region", { name: /^Achievements/ });
    const icons = within(lifetime).getAllByRole("button");
    expect(icons).toHaveLength(16);
    expect(region).toContainElement(icons.at(-1)!);
    // The body is the one element that scrolls.
    const scrollers = [...region.querySelectorAll<HTMLElement>("*")].filter((el) => /(^|\s)overflow-(y-)?(auto|scroll)(\s|$)/.test(el.getAttribute("class") ?? ""));
    expect(scrollers).toEqual([]);
    // A vertical drag that starts on a card or a medallion scrolls the region: nothing of the page sets its own touch action, and no
    // fixed height or clip stands between a medallion and the region.
    const touchy = [...region.querySelectorAll<HTMLElement>("*")].filter((el) => /(^|\s)touch-(none|pan-x|pinch-zoom)(\s|$)/.test(el.getAttribute("class") ?? ""));
    expect(touchy).toEqual([]);
    for (let el: HTMLElement | null = icons.at(-1)!; el && el !== region; el = el.parentElement) expect(el.className).not.toMatch(BOXED);
  });

  it("Tiles draws its stage, its skins and its 19 tiles in the HUD drawer's body (COLLECTION-PAGE), to the last tile", () => {
    draw(<TilesScene {...TILES.owned} onBack={no()} />, false, "Tiles");
    const drawer = screen.getByRole("dialog", { name: "Tiles" });
    const region = drawer.querySelector<HTMLElement>("[data-hud-drawer-body]")!;
    expect(region.className).toMatch(/(^|\s)overflow-y-auto(\s|$)/);
    expect(region.className).toMatch(/(^|\s)min-h-0(\s|$)/);
    expect(region.className).toContain("overscroll-contain");
    expect(region).toContainElement(screen.getByRole("region", { name: "Selected tile" }));
    expect(region).toContainElement(screen.getByRole("list", { name: "Tile 7: skins" }));
    const tiles = within(screen.getByRole("list", { name: "Tiles" })).getAllByRole("button");
    expect(tiles).toHaveLength(19);
    expect(region).toContainElement(tiles.at(-1)!);
    const scrollers = [...region.querySelectorAll<HTMLElement>("*")].filter((el) => /(^|\s)overflow-(y-)?(auto|scroll)(\s|$)/.test(el.getAttribute("class") ?? ""));
    expect(scrollers).toEqual([]);
    // Nothing of the page sets its own touch action: a vertical drag on the grid or the skins scrolls the region (the 3D tile's canvas
    // takes the finger to turn it, OrbitControls' own style, in the browser only).
    const touchy = [...region.querySelectorAll<HTMLElement>("*")].filter((el) => /(^|\s)touch-(none|pan-x|pinch-zoom)(\s|$)/.test(el.getAttribute("class") ?? ""));
    expect(touchy).toEqual([]);
    for (let el: HTMLElement | null = tiles.at(-1)!; el && el !== region; el = el.parentElement) expect(el.className).not.toMatch(BOXED);
  });
});
