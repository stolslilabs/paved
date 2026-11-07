/**
 * PAGES-SCROLL (#782): the harness of `pages-scroll.e2e.ts`, served by the Vite dev server (never built). `?page=<id>` draws one
 * page's scene with content taller than a 375 x 812 phone and than the 1440 x 900 side panel (the mocks' content, its lists
 * made long: a long list of attacks and defences, more offers, more missions; the referral's widest text), as the app draws it: in the tab frame
 * below `desktop`, or `&panel=1` in the home's side panel.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import "../../src/styles/fonts.css";
import "../../src/styles/theme.css";
import { BalancesProvider } from "../../src/components/containers/balances-context";
import PagePanel from "../../src/components/containers/page-panel";
import { PlayScene } from "../../src/components/scenes/play-scene";
import { TilesScene } from "../../src/components/scenes/tiles-scene";
import { PvpLeagueScene } from "../../src/components/scenes/pvp-league-scene";
import { MissionsScene } from "../../src/components/scenes/missions-scene";
import { AvatarCreatorScene } from "../../src/components/scenes/avatar-creator-scene";
import { ReferralScene } from "../../src/components/scenes/referral-scene";
import { SettingsScene } from "../../src/components/scenes/settings-scene";
import { ThemeScene } from "../../src/components/scenes/theme-scene";
import { VaultScene } from "../../src/components/scenes/vault-scene";
import { ShopScene } from "../../src/components/scenes/shop-scene";
import { LeaderboardScene } from "../../src/components/scenes/leaderboard-scene";
import { StoryScene } from "../../src/components/scenes/story-scene";
import { CAMPAIGNS } from "@paved/game-core";
import { appRenders } from "../../src/mocks/assets";
import { STORY } from "../../src/mocks/story";
import { titleOf } from "../../src/lib/music/track-info";
import { TRACKS } from "../../src/lib/music/tracks";
import { PVP_LEAGUE, PVP_MATCHES } from "../../src/mocks/pvp";
import { AVATAR_CREATOR, MISSIONS, PLAY, REFERRAL, SETTINGS, THEME, TILES, VAULT } from "../../src/mocks/scenes";
import { SHOP } from "../../src/mocks/shop";
import { LEADERBOARD } from "../../src/mocks/ranking";

const no = () => {};
/** The Settings drawer's callbacks (SETTINGS-PAGE), none of which the pass presses. */
const settingsActions = { onChange: no, onVolumeChange: no, onReset: no, onView: no, onViewBack: no, onBack: no };
/** `list` made `n` long, each copy with its own `key` number. */
function long<T>(list: readonly T[], n: number, key?: keyof T): T[] {
  return Array.from({ length: n }, (_, i) => {
    const item = list[i % list.length]!;
    return key ? { ...item, [key]: Number(item[key]) * 100 + i } : item;
  });
}

const achievements = MISSIONS.daily.achievements;

/**
 * Missions as its route draws it (#832): its clock ticks every second (`useIndexerNow`), so the whole page draws again each second
 * while the finger drags; the lifetime icons made long.
 */
function TickingMissions() {
  const [now, setNow] = useState(MISSIONS.daily.now);
  useEffect(() => {
    const timer = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <MissionsScene
      {...MISSIONS.daily}
      now={now}
      achievements={{ ...achievements, achievements: long(achievements.achievements, 40, "achievementId") }}
      onClaimQuest={no}
      onClaimAchievement={no}
    />
  );
}

/**
 * The pages of the pass, by id: the title its header shows, its scene with long content. `drawer`: the HUD's drawer
 * (MISSIONS-PAGE, LEAGUE-PAGE, SHOP-PAGE, COLLECTION-PAGE, SETTINGS-PAGE, PLAY-PAGE, STORY-PAGE, LEADERBOARD-PAGE) at every width, its own panel: never in the
 * page panel.
 */
export const PAGES: Record<string, { title: string; page: ReactNode; drawer?: true }> = {
  // The Shop (SHOP-PAGE), the HUD's drawer: Forest's view, its 19 tiles in the Shop's cards.
  shop: { title: "Forest", drawer: true, page: <ShopScene {...SHOP.forest} onBack={no} onTab={no} onThemeBack={no} /> },
  // The League as it opens (LEAGUE-PAGE): the carousel, the season's last day, the latest battle logs.
  league: { title: "League", drawer: true, page: <PvpLeagueScene {...PVP_LEAGUE.lastDay} matches={PVP_MATCHES.latest} onBack={no} onOpenMatch={no} /> },
  // Settings (SETTINGS-PAGE): the HUD's drawer, its groups; Themes and Credits are views of the same drawer.
  settings: { title: "Settings", drawer: true, page: <SettingsScene {...SETTINGS.connected} {...settingsActions} /> },
  missions: { title: "Missions", drawer: true, page: <TickingMissions /> },
  // The Vault (VAULT-PAGE): the HUD's drawer, its footer's tabs; the largest figures on its tallest tab, the Position (its own tab
  // since the owner's ask of 2026-11-07, so of fixed length: `SHORT`).
  vault: { title: "Vault", drawer: true, page: <VaultScene {...VAULT.stress} mode="position" onBack={no} /> },
  // The League with a long list of attacks and defences (#786, in place of the defence log): 20 rows and Show more.
  defence: { title: "League", drawer: true, page: <PvpLeagueScene {...PVP_LEAGUE.bronze} matches={{ ...PVP_MATCHES.latest, matches: PVP_MATCHES.many.matches }} onBack={no} onOpenMatch={no} /> },
  themes: {
    title: "Themes",
    drawer: true,
    page: <SettingsScene {...SETTINGS.connected} {...settingsActions} view="themes" themes={<ThemeScene {...THEME.mixed} onUse={no} onOpen={no} onMyTiles={no} />} />,
  },
  // Tiles (COLLECTION-PAGE): the HUD's drawer, its 3D stage, its skins and the 19 tiles.
  tiles: { title: "Tiles", drawer: true, page: <TilesScene {...TILES.owned} onBack={no} /> },
  referral: { title: "Referral", page: <ReferralScene {...REFERRAL.stress} onBack={no} onNavigate={no} /> },
  // Play (PLAY-PAGE): the HUD's drawer, its four groups of modes (no full-screen flow left).
  play: { title: "Play", drawer: true, page: <PlayScene {...PLAY.connected} onBack={no} onChallenge={no} onTraining={no} onStory={no} onAttack={no} /> },
  // Story's campaigns (STORY-PAGE): a view of Play's drawer, the Tutorial under way, its twelve levels.
  story: {
    title: "Story",
    drawer: true,
    page: <PlayScene {...PLAY.connected} story={<StoryScene campaigns={CAMPAIGNS} renders={appRenders} {...STORY.inProgress} onCampaign={no} onLevel={no} />} onBack={no} onStoryBack={no} />,
  },
  credits: { title: "Credits", drawer: true, page: <SettingsScene {...SETTINGS.connected} {...settingsActions} view="credits" credits={{ tracks: TRACKS.map(titleOf) }} /> },
  // The avatar editor (AVATAR-PAGE): the HUD's drawer, Headwear's eleven options and the one on sale tried on.
  avatar: { title: "Avatar", drawer: true, page: <AvatarCreatorScene {...AVATAR_CREATOR.priced} onBack={no} onClose={no} /> },
  // The Leaderboard (LEADERBOARD-PAGE): the HUD's drawer, the community's fifty players by crowns, the viewer's row pinned over the
  // footer's tabs.
  ranking: { title: "Ranking", drawer: true, page: <LeaderboardScene {...LEADERBOARD.playersOutOfView} onBack={no} /> },
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
            ) : inPanel && !entry.drawer ? (
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
