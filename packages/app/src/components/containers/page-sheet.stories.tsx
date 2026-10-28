import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { titleOf } from "../../lib/music/track-info";
import { TRACKS } from "../../lib/music/tracks";
import { CAMPAIGNS, EMPTY_PROGRESS } from "@paved/game-core";
import { appRenders } from "../../mocks/assets";
import { COBBLES, MY_TILES, PLAY, REFERRAL, SETTINGS, THEME, THEME_SHOP } from "../../mocks/scenes";
import { CobblesScene } from "../scenes/cobbles-scene";
import { CreditsScene } from "../scenes/credits-scene";
import { MyTilesScene } from "../scenes/my-tiles-scene";
import { PlayScene } from "../scenes/play-scene";
import { ReferralScene } from "../scenes/referral-scene";
import { SettingsScene } from "../scenes/settings-scene";
import { StoryScene } from "../scenes/story-scene";
import { ThemeScene } from "../scenes/theme-scene";
import { ThemeShopScene } from "../scenes/theme-shop-scene";
import { PHONE_375, WIDE_1440 } from "../scenes/viewports";
import { BalancesOf, BalancesProvider, PACKS_BALANCES, PACKS_HERE } from "./balances-context";
import PagePanel from "./page-panel";
import PageSheet from "./page-sheet";

const READY = { status: "ready", usdc: 100_000_000n, paved: 129_110_000_000_000_000_000n, cobbles: 640 } as const;

/**
 * BACK-RULE (#783, the owner's decisions of 2026-10-26): no page opens another page. Settings' pages (the themes, a theme, My
 * tiles, the credits, the referral) are this sheet over Settings: from the bottom on a phone (a drag down closes it), from the
 * right from `desktop`, over Settings' side panel. Its header has Back, the title and the Cobbles: Back (or Escape, a tap outside,
 * a drag down) closes it, up to Settings. Story's campaigns are the same sheet over Play's modes, and the Cobble packs open in it over the page that asks
 * for them (a theme's Get Cobbles, the tile shop's, the avatar's, the header's Cobbles off the village). On the mock.
 */
const meta = {
  title: "Containers/PageSheet",
  component: PageSheet,
  parameters: { layout: "fullscreen" },
  args: { open: true, title: "Themes", side: "bottom", onClose: fn(), children: null },
} satisfies Meta<typeof PageSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

const SETTINGS_PAGE = <SettingsScene {...SETTINGS.connected} onNavigate={fn()} onChange={fn()} onBack={fn()} />;
const PLAY_PAGE = <PlayScene {...PLAY.connected} onBack={fn()} onChallenge={fn()} onTraining={fn()} onStory={fn()} onAttack={fn()} />;

/** The page under the sheet (Settings by default): a full page on a phone, the side panel from `desktop`. */
function OverSettings({ panel, under = SETTINGS_PAGE, title = "Settings", children }: { panel: boolean; under?: ReactNode; title?: string; children: ReactNode }) {
  return (
    <BalancesProvider value={{ state: READY, onAction: fn() }}>
      {panel ? (
        <PagePanel open title={title} onClose={fn()}>
          {under}
        </PagePanel>
      ) : (
        under
      )}
      {children}
    </BalancesProvider>
  );
}

const sheet = (title: string, page: ReactNode, wide = false, under?: { page: ReactNode; title: string }): Story => ({
  args: { title, side: wide ? "right" : "bottom" },
  render: (args) => (
    <OverSettings panel={wide} under={under?.page} title={under?.title}>
      <PageSheet {...args}>{page}</PageSheet>
    </OverSettings>
  ),
  ...(wide ? WIDE_1440 : PHONE_375),
});

const themes = <ThemeScene {...THEME.mixed} onBack={fn()} onNavigate={fn()} onUse={fn()} onOpen={fn()} onMyTiles={fn()} />;
const shop = <ThemeShopScene {...THEME_SHOP.forest} onBack={fn()} onNavigate={fn()} onBuy={fn()} onBuyCobbles={fn()} onMyTiles={fn()} />;
const tiles = <MyTilesScene {...MY_TILES.owned} onBack={fn()} onNavigate={fn()} onPick={fn()} onSave={fn()} onDiscard={fn()} onOpenShop={fn()} />;
const credits = <CreditsScene tracks={TRACKS.map(titleOf)} onBack={fn()} onNavigate={fn()} />;
const referral = <ReferralScene {...REFERRAL.earned} onBack={fn()} onNavigate={fn()} onCopy={fn()} />;

/** The themes over Settings at 375 px: the sheet from the bottom, its grab bar, Settings dimmed behind it. */
export const ThemesPhone: Story = sheet("Themes", themes);
/** A theme's shop, opened from the themes in the same sheet (its entry replaced): the close still goes to Settings. */
export const ThemePhone: Story = sheet("Theme", shop);
export const MyTilesPhone: Story = sheet("My tiles", tiles);
export const CreditsPhone: Story = sheet("Credits", credits);
export const ReferralPhone: Story = sheet("Referral", referral);
/** At 1440 px: the sheet from the right, over Settings' side panel and the village. */
export const ThemesWide: Story = sheet("Themes", themes, true);
export const ThemeWide: Story = sheet("Theme", shop, true);
export const MyTilesWide: Story = sheet("My tiles", tiles, true);
export const CreditsWide: Story = sheet("Credits", credits, true);
export const ReferralWide: Story = sheet("Referral", referral, true);
const story = <StoryScene campaigns={CAMPAIGNS} progress={EMPTY_PROGRESS} renders={appRenders} onBack={fn()} onCampaign={fn()} onLevel={fn()} />;
// In the sheet the packs show their own balances, the Cobbles and USDC, not the page's under them (#855: the packs' page).
const packs = (
  <BalancesOf kinds={PACKS_BALANCES} here={PACKS_HERE}>
    <CobblesScene {...COBBLES.packs} onBack={fn()} onSelectPack={fn()} onBuyPack={fn()} />
  </BalancesOf>
);
const overPlay = { page: PLAY_PAGE, title: "Play" };
/** Story's campaigns over Play's modes: the close goes back to Play; a level opens full screen. */
export const StoryPhone: Story = sheet("Story", story, false, overPlay);
export const StoryWide: Story = sheet("Story", story, true, overPlay);
/** The Cobble packs in place over the page that asked for them (here Settings, from the header's Cobbles): no page is opened. */
export const CobblesPhone: Story = sheet("Cobbles", packs);
export const CobblesWide: Story = sheet("Cobbles", packs, true);
/** Reduced motion: the sheet appears without sliding. */
export const ReducedMotion: Story = { ...ThemesPhone, parameters: { ...ThemesPhone.parameters, reducedMotion: "always" } };
