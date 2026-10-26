import { render, screen } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BalancesProvider } from "../src/components/containers/balances-context";
import PagePanel from "../src/components/containers/page-panel";
import { AchievementsScene } from "../src/components/scenes/achievements-scene";
import { CreditsScene } from "../src/components/scenes/credits-scene";
import { PvpDefenceScene } from "../src/components/scenes/pvp-defence-scene";
import { PvpLeagueScene } from "../src/components/scenes/pvp-league-scene";
import { QuestsScene } from "../src/components/scenes/quests-scene";
import { ReferralScene } from "../src/components/scenes/referral-scene";
import { SettingsScene } from "../src/components/scenes/settings-scene";
import { ThemeScene } from "../src/components/scenes/theme-scene";
import { VaultScene } from "../src/components/scenes/vault-scene";
import { VillageChestsScene } from "../src/components/scenes/village-chests-scene";
import { VillageShopScene } from "../src/components/scenes/village-shop-scene";
import { PVP_DEFENCE, PVP_LEAGUE } from "../src/mocks/pvp";
import { ACHIEVEMENTS, QUESTS, REFERRAL, SETTINGS, THEME, VAULT } from "../src/mocks/scenes";
import { VILLAGE_CHESTS, VILLAGE_SHOP } from "../src/mocks/village-v2";
import { titleOf } from "../src/lib/music/track-info";
import { TRACKS } from "../src/lib/music/tracks";

/**
 * PAGES-SCROLL (#782, the owner's decisions of 2026-10-26): every page of the bar, Missions, the Vault and the second-level pages
 * scroll in one region, below `desktop` (`TabFrame`'s) and in the side panel from it (the panel's body). The page is drawn
 * straight in that region: its sticky header and its content are the region's own (no column of its own between them and the
 * region, one viewport tall at least), so the region is the one element that scrolls. jsdom lays nothing
 * out: the page's height against a 375 or 1440 px viewport is measured in a browser (`scripts/pages-scroll.ts`); here the mock
 * gives each page more than a screen of content (the leagues' ladder, a chest list, the settings' rows) and the test reads the
 * structure that lets it scroll.
 */
const no = () => vi.fn();
const PAGES: readonly [string, ReactNode][] = [
  ["Tile shop", <VillageShopScene {...VILLAGE_SHOP.today} onBack={no()} onNavigate={no()} onBuy={no()} onGetCobbles={no()} />],
  ["Chests", <VillageChestsScene {...VILLAGE_CHESTS.waiting} onBack={no()} onNavigate={no()} onPlay={no()} onOpen={no()} onTake={no()} />],
  ["League", <PvpLeagueScene {...PVP_LEAGUE.gold} onBack={no()} onNavigate={no()} onAttack={no()} onDefence={no()} />],
  ["Settings", <SettingsScene {...SETTINGS.connected} onNavigate={no()} onChange={no()} />],
  ["Missions", <QuestsScene {...QUESTS.today} onNavigate={no()} onDayChange={no()} onTab={no()} onClaim={no()} onClaimAll={no()} />],
  ["Missions", <AchievementsScene {...ACHIEVEMENTS.mixed} onNavigate={no()} onTab={no()} onClaim={no()} onClaimAll={no()} />],
  ["Vault", <VaultScene {...VAULT.position} onNavigate={no()} />],
  ["Defence log", <PvpDefenceScene {...PVP_DEFENCE.shielded} onBack={no()} onNavigate={no()} onReplay={no()} />],
  ["Themes", <ThemeScene {...THEME.mixed} onBack={no()} onNavigate={no()} onUse={no()} onOpen={no()} />],
  ["Referral", <ReferralScene {...REFERRAL.earned} onBack={no()} onNavigate={no()} />],
  ["Credits", <CreditsScene tracks={TRACKS.map(titleOf)} onBack={no()} onNavigate={no()} />],
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

  it("the League and the Chests carry more than a screen of content: every league, every waiting chest", () => {
    draw(PAGES[2]![1], false, "League");
    expect(screen.getByRole("list").querySelectorAll("li").length).toBeGreaterThanOrEqual(8);
  });
});
