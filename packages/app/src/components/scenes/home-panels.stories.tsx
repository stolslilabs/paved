import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PVP_LEAGUE } from "../../mocks/pvp";
import { COBBLES, MISSIONS, PLAY, PLAYER_STATUS, SETTINGS, THEME, VAULT } from "../../mocks/scenes";
import { PROGRESS } from "../../mocks/players";
import { HOME_VILLAGE, VILLAGE_CHESTS, VILLAGE_SHOP } from "../../mocks/village-v2";
import { BalancesProvider } from "../containers/balances-context";
import PagePanel from "../containers/page-panel";
import PageSheet from "../containers/page-sheet";
import { ProfileProvider } from "../containers/profile-context";
import { CobblesScene } from "./cobbles-scene";
import { HomeVillageScene, type HomeVillageSceneProps } from "./home-village-scene";
import { PlayScene } from "./play-scene";
import { PvpLeagueScene } from "./pvp-league-scene";
import { MissionsScene } from "./missions-scene";
import { SettingsScene } from "./settings-scene";
import { ThemeScene } from "./theme-scene";
import { VaultScene } from "./vault-scene";
import { VillageChestsScene } from "./village-chests-scene";
import { VillageShopScene } from "./village-shop-scene";
import { PHONE_375, WIDE_1440 } from "./viewports";


const tileArt = originalTileArt(SOURCE_ASSETS);

/**
 * DESK-PANELS (#762, the owner's decisions of 2026-10-25): from `desktop` the overlay's pages open in a side panel on the right,
 * over the village (the League's on the left, #829; dimmed; a click on it or Escape closes it, no close button since #782), laid out as on a phone. One story per page of the
 * overlay at 1440 px (the Viewport toolbar can switch it; below `desktop` the app draws these pages full screen instead); the
 * home's Cobbles in every panel's header (ONE-HEADER, #781). No page opens another (BACK-RULE, #783): the defence log is a
 * section of the League, and the themes are a sheet over Settings' panel. The profile opens on the left. The village is the plan view (the `Scene` stories of `Scenes/Home` have the 3D).
 */
const meta = {
  title: "Scenes/Home/Panels",
  component: HomeVillageScene,
  parameters: { layout: "fullscreen" },
  args: {
    ...HOME_VILLAGE.view,
    tileArt,
    onEditingChange: fn(),
    onPlay: fn(),
    onMissions: fn(),
    onChests: fn(),
    onShop: fn(),
    onVault: fn(),
    onLeague: fn(),
    onSettings: fn(),
    onNavigate: fn(),
  },
  ...WIDE_1440,
} satisfies Meta<typeof HomeVillageScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The shell's providers (the avatar, the balances), the home and, open over it, the panel. */
function HomeWith({ args, title, top = true, side, children }: { args: HomeVillageSceneProps; title?: string; top?: boolean; side?: "left"; children?: ReactNode }) {
  return (
    <ProfileProvider value={{ state: { status: "connected", data: PLAYER_STATUS }, progress: PROGRESS.start, onConnect: fn(), onDisconnect: fn(), onCopy: fn(async () => {}) }}>
      <BalancesProvider value={{ state: { status: "ready", usdc: 100_000_000n, paved: 129_110_000_000_000_000_000n, cobbles: 640 }, faucet: false }}>
        <HomeVillageScene {...args} />
        {title && (
          <PagePanel open title={title} top={top} side={side} onClose={fn()}>
            {children}
          </PagePanel>
        )}
      </BalancesProvider>
    </ProfileProvider>
  );
}

const panel = (title: string, page: ReactNode, options: { top?: boolean; side?: "left" } = {}): Story => ({
  render: (args) => (
    <HomeWith args={args} title={title} {...options}>
      {page}
    </HomeWith>
  ),
});

/** Missions (#832): the selected mission's card, the Limited and the Lifetime icons, the Cobbles they earn in the header. */
export const Missions: Story = panel("Missions", <MissionsScene {...MISSIONS.daily} onNavigate={fn()} onClaimQuest={fn()} onClaimAchievement={fn()} />);
/** The Chests: the slots, the chest to open, the Cobbles. */
export const Chests: Story = panel("Chests", <VillageChestsScene {...VILLAGE_CHESTS.closed} tileArt={tileArt} onBack={fn()} onNavigate={fn()} onPlay={fn()} onOpen={fn()} onTake={fn()} />);
/** The day's tile shop, the Cobbles in the header. */
export const Shop: Story = panel("Tile shop", <VillageShopScene {...VILLAGE_SHOP.today} tileArt={tileArt} onBack={fn()} onNavigate={fn()} onBuy={fn()} onGetCobbles={fn()} />);
/** The Vault: the same Cobbles in the header as every page, the wallet's PAVED on its first line. */
export const Vault: Story = panel("Vault", <VaultScene {...VAULT.position} onNavigate={fn()} />);
/**
 * The League, its defence log in place under Attack (BACK-RULE, #783). Its panel slides in from the left (#829, the owner's
 * decision of 2026-10-27), as the profile's sheet: its button is on the home's left, under the profile.
 */
export const League: Story = panel("League", <PvpLeagueScene {...PVP_LEAGUE.bronze} onBack={fn()} onNavigate={fn()} onOpenMatch={fn()} />, { side: "left" });
/** Settings, from the gear. */
export const Settings: Story = panel("Settings", <SettingsScene {...SETTINGS.connected} onNavigate={fn()} onChange={fn()} />);
/** The themes, from Settings: a sheet over its panel (BACK-RULE, #783), its close up to Settings, the Cobbles they cost in its header. */
export const Themes: Story = panel(
  "Settings",
  <>
    <SettingsScene {...SETTINGS.connected} onNavigate={fn()} onChange={fn()} />
    <PageSheet open title="Themes" side="right" onClose={fn()}>
      <ThemeScene {...THEME.mixed} onBack={fn()} onNavigate={fn()} onUse={fn()} onOpen={fn()} />
    </PageSheet>
  </>,
);
/** Play's mode choice (the games themselves open full screen). */
export const Play: Story = panel("Play", <PlayScene {...PLAY.connected} onBack={fn()} onChallenge={fn()} onTraining={fn()} onStory={fn()} onAttack={fn()} />);
/** The Cobble packs, from the balances. */
export const Cobbles: Story = panel("Cobbles", <CobblesScene {...COBBLES.packs} onBack={fn()} onSelectPack={fn()} onBuyPack={fn()} />);

/** The profile, from the avatar: its sheet on the left, as before (#624). */
export const Profile: Story = {
  render: (args) => <HomeWith args={args} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: /^Profile/ }));
  },
};

/** Below `desktop` the same page is a full page with the phone's bar (#763), not a panel: Missions at 375 px, for comparison. */
export const MissionsPhone: Story = {
  ...PHONE_375,
  render: () => <MissionsScene {...MISSIONS.daily} onNavigate={fn()} onClaimQuest={fn()} onClaimAchievement={fn()} />,
};
