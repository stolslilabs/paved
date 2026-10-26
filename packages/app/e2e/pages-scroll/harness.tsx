/**
 * PAGES-SCROLL (#782): the harness of `pages-scroll.e2e.ts`, served by the Vite dev server (never built). `?page=<id>` draws one
 * page's scene with content taller than a 375 x 812 phone and than the 1440 x 900 side panel (the mocks' content, its lists
 * made long: a dozen chests waiting, a long defence log, more offers, more missions; the referral's widest text), as the app draws it: in the tab frame
 * below `desktop`, or `&panel=1` in the home's side panel.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import "../../src/styles/fonts.css";
import "../../src/styles/theme.css";
import { BalancesProvider } from "../../src/components/containers/balances-context";
import PagePanel from "../../src/components/containers/page-panel";
import { CobblesScene } from "../../src/components/scenes/cobbles-scene";
import { PlayScene } from "../../src/components/scenes/play-scene";
import { ThemeShopScene } from "../../src/components/scenes/theme-shop-scene";
import { AchievementsScene } from "../../src/components/scenes/achievements-scene";
import { CreditsScene } from "../../src/components/scenes/credits-scene";
import { MyTilesScene } from "../../src/components/scenes/my-tiles-scene";
import { PvpDefenceScene } from "../../src/components/scenes/pvp-defence-scene";
import { PvpLeagueScene } from "../../src/components/scenes/pvp-league-scene";
import { QuestsScene } from "../../src/components/scenes/quests-scene";
import { ReferralScene } from "../../src/components/scenes/referral-scene";
import { SettingsScene } from "../../src/components/scenes/settings-scene";
import { ThemeScene } from "../../src/components/scenes/theme-scene";
import { VaultScene } from "../../src/components/scenes/vault-scene";
import { VillageChestsScene } from "../../src/components/scenes/village-chests-scene";
import { VillageShopScene } from "../../src/components/scenes/village-shop-scene";
import { titleOf } from "../../src/lib/music/track-info";
import { TRACKS } from "../../src/lib/music/tracks";
import { PVP_DEFENCE, PVP_LEAGUE } from "../../src/mocks/pvp";
import { ACHIEVEMENTS, COBBLES, MY_TILES, PLAY, QUESTS, REFERRAL, SETTINGS, THEME, THEME_SHOP, VAULT } from "../../src/mocks/scenes";
import { CHESTS, VILLAGE_CHESTS, VILLAGE_SHOP } from "../../src/mocks/village-v2";

const no = () => {};
/** `list` made `n` long, each copy with its own `key` number. */
function long<T>(list: readonly T[], n: number, key?: keyof T): T[] {
  return Array.from({ length: n }, (_, i) => {
    const item = list[i % list.length]!;
    return key ? { ...item, [key]: Number(item[key]) * 100 + i } : item;
  });
}

const chests = long(CHESTS, 12, "id");
const quests = QUESTS.today.quests;

/**
 * The pages of the pass, by id: the title its header shows, its scene with long content. `flow`: a full-screen flow below
 * `desktop` (Play, Cobbles: no tab frame, the document scrolls), a page of the side panel from it.
 */
export const PAGES: Record<string, { title: string; page: ReactNode; flow?: true }> = {
  shop: { title: "Tile shop", page: <VillageShopScene {...VILLAGE_SHOP.today} offers={long(VILLAGE_SHOP.today.offers, 9)} onBack={no} onNavigate={no} onBuy={no} onGetCobbles={no} /> },
  chests: { title: "Chests", page: <VillageChestsScene {...VILLAGE_CHESTS.waiting} chests={chests} onBack={no} onNavigate={no} onPlay={no} onOpen={no} onTake={no} /> },
  league: { title: "League", page: <PvpLeagueScene {...PVP_LEAGUE.lastDay} best={PVP_LEAGUE.lastDay.crowns + 400} attacks={2} onBack={no} onNavigate={no} onAttack={no} onDefence={no} /> },
  settings: { title: "Settings", page: <SettingsScene {...SETTINGS.connected} onNavigate={no} onChange={no} /> },
  missions: { title: "Missions", page: <QuestsScene {...QUESTS.today} quests={{ ...quests, quests: long(quests.quests, 9, "questId") }} onNavigate={no} onDayChange={no} onTab={no} onClaim={no} onClaimAll={no} /> },
  lifetime: { title: "Missions", page: <AchievementsScene {...ACHIEVEMENTS.mixed} onNavigate={no} onTab={no} onClaim={no} onClaimAll={no} /> },
  vault: { title: "Vault", page: <VaultScene {...VAULT.stress} onNavigate={no} /> },
  defence: { title: "Defence log", page: <PvpDefenceScene {...PVP_DEFENCE.shielded} attacks={long(PVP_DEFENCE.shielded.attacks, 14, "id")} onBack={no} onNavigate={no} onReplay={no} /> },
  themes: { title: "Themes", page: <ThemeScene {...THEME.mixed} onBack={no} onNavigate={no} onUse={no} onOpen={no} /> },
  tiles: { title: "My tiles", page: <MyTilesScene {...MY_TILES.owned} onBack={no} onNavigate={no} /> },
  referral: { title: "Referral", page: <ReferralScene {...REFERRAL.stress} onBack={no} onNavigate={no} /> },
  theme: { title: "Forest", page: <ThemeShopScene {...THEME_SHOP.forest} onBuy={no} onBuyCobbles={no} onMyTiles={no} onBack={no} onNavigate={no} /> },
  play: { title: "Choose a mode", flow: true, page: <PlayScene {...PLAY.connected} onBack={no} onChallenge={no} onTraining={no} onStory={no} onAttack={no} /> },
  cobbles: { title: "Cobbles", flow: true, page: <CobblesScene {...COBBLES.referred} onBack={no} onSelectPack={no} onBuyPack={no} /> },
  credits: { title: "Credits", page: <CreditsScene tracks={TRACKS.map(titleOf)} onBack={no} onNavigate={no} /> },
};

const params = new URLSearchParams(location.search);
const entry = PAGES[params.get("page") ?? ""];
const inPanel = params.get("panel") === "1";
const balances = { state: { status: "ready", usdc: 100_000_000n, paved: 0n, cobbles: 640 }, faucet: false, show: { phone: true, desktop: "all" } } as const;

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>
      <LazyMotion features={domMax}>
        <MotionConfig reducedMotion="always">
          <BalancesProvider value={balances}>
            {!entry ? (
              <p>Unknown page</p>
            ) : inPanel ? (
              <PagePanel open title={entry.title} onClose={no}>
                {entry.page}
              </PagePanel>
            ) : (
              entry.page
            )}
          </BalancesProvider>
        </MotionConfig>
      </LazyMotion>
    </MemoryRouter>
  </QueryClientProvider>,
);
