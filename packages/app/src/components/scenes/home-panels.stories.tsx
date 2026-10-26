import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PVP_DEFENCE, PVP_LEAGUE } from "../../mocks/pvp";
import { COBBLES, PLAY, PLAYER_STATUS, QUESTS, SETTINGS, THEME, VAULT } from "../../mocks/scenes";
import { PROGRESS } from "../../mocks/players";
import { HOME_VILLAGE, VILLAGE_CHESTS, VILLAGE_SHOP } from "../../mocks/village-v2";
import { BalancesProvider, type HeaderBalances } from "../containers/balances-context";
import PagePanel from "../containers/page-panel";
import { ProfileProvider } from "../containers/profile-context";
import { CobblesScene } from "./cobbles-scene";
import { HomeVillageScene, type HomeVillageSceneProps } from "./home-village-scene";
import { PlayScene } from "./play-scene";
import { PvpDefenceScene } from "./pvp-defence-scene";
import { PvpLeagueScene } from "./pvp-league-scene";
import { QuestsScene } from "./quests-scene";
import { SettingsScene } from "./settings-scene";
import { ThemeScene } from "./theme-scene";
import { VaultScene } from "./vault-scene";
import { VillageChestsScene } from "./village-chests-scene";
import { VillageShopScene } from "./village-shop-scene";
import { PHONE_375, WIDE_1440 } from "./viewports";

/** The Cobbles where they are bought, earned or spent (`header-balances.ts`), every balance on the home's rail. */
const COBBLES_RULE: HeaderBalances = { phone: true, desktop: "all" };
/** No balance in the panel's header, every balance on the home's rail. */
const NONE_IN_PANEL: HeaderBalances = { phone: false, desktop: "all" };

const tileArt = originalTileArt(SOURCE_ASSETS);

/**
 * DESK-PANELS (#762, the owner's decisions of 2026-10-25): from `desktop` the overlay's pages open in a side panel on the right,
 * over the village (dimmed; a click on it, Escape or the `xmark` closes), laid out as on a phone. One story per page of the
 * overlay at 1440 px (the Viewport toolbar can switch it; below `desktop` the app draws these pages full screen instead); the
 * Cobbles in the panel's header only where the page's rule shows them; Themes and the defence log, reached from another page,
 * keep Back. The profile opens on the left. The village is the plan view (the `Scene` stories of `Scenes/Home` have the 3D).
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

/** The shell's providers (the avatar, the balances under the page's rule), the home and, open over it, the panel. */
function HomeWith({ args, show = COBBLES_RULE, title, top = true, children }: { args: HomeVillageSceneProps; show?: HeaderBalances; title?: string; top?: boolean; children?: ReactNode }) {
  return (
    <ProfileProvider value={{ state: { status: "connected", data: PLAYER_STATUS }, progress: PROGRESS.start, onConnect: fn(), onDisconnect: fn(), onCopy: fn(async () => {}) }}>
      <BalancesProvider value={{ state: { status: "ready", usdc: 100_000_000n, paved: 129_110_000_000_000_000_000n, cobbles: 640 }, faucet: false, show }}>
        <HomeVillageScene {...args} />
        {title && (
          <PagePanel open title={title} top={top} onClose={fn()}>
            {children}
          </PagePanel>
        )}
      </BalancesProvider>
    </ProfileProvider>
  );
}

const panel = (title: string, page: ReactNode, options: { show?: HeaderBalances; top?: boolean } = {}): Story => ({
  render: (args) => (
    <HomeWith args={args} title={title} {...options}>
      {page}
    </HomeWith>
  ),
});

/** Missions (the Limited tab), with the Cobbles they earn in the header. */
export const Missions: Story = panel("Missions", <QuestsScene {...QUESTS.today} onNavigate={fn()} onDayChange={fn()} onTab={fn()} onClaim={fn()} onClaimAll={fn()} />);
/** The Chests: the slots, the chest to open, the Cobbles. */
export const Chests: Story = panel("Chests", <VillageChestsScene {...VILLAGE_CHESTS.closed} tileArt={tileArt} onBack={fn()} onNavigate={fn()} onPlay={fn()} onOpen={fn()} onTake={fn()} />);
/** The day's tile shop, the Cobbles in the header. */
export const Shop: Story = panel("Tile shop", <VillageShopScene {...VILLAGE_SHOP.today} tileArt={tileArt} onBack={fn()} onNavigate={fn()} onBuy={fn()} onGetCobbles={fn()} />);
/** The Vault: no balance in the header (they are on the page). */
export const Vault: Story = panel("Vault", <VaultScene {...VAULT.position} onNavigate={fn()} />, { show: NONE_IN_PANEL });
/** The League, its defence log a tap away. */
export const League: Story = panel("League", <PvpLeagueScene {...PVP_LEAGUE.gold} onBack={fn()} onNavigate={fn()} onAttack={fn()} onDefence={fn()} />, { show: NONE_IN_PANEL });
/** The defence log, reached from the League: Back to it, in the same panel. */
export const DefenceLog: Story = panel("Defence log", <PvpDefenceScene {...PVP_DEFENCE.shielded} onBack={fn()} onNavigate={fn()} onReplay={fn()} />, { show: NONE_IN_PANEL, top: false });
/** Settings, from the gear. */
export const Settings: Story = panel("Settings", <SettingsScene {...SETTINGS.connected} onNavigate={fn()} onChange={fn()} />, { show: NONE_IN_PANEL });
/** The themes, reached from Settings: Back to it, the Cobbles they cost in the header. */
export const Themes: Story = panel("Themes", <ThemeScene {...THEME.mixed} onBack={fn()} onNavigate={fn()} onUse={fn()} onOpen={fn()} />, { top: false });
/** Play's mode choice (the games themselves open full screen). */
export const Play: Story = panel("Play", <PlayScene {...PLAY.connected} onBack={fn()} onChallenge={fn()} onTraining={fn()} onStory={fn()} onAttack={fn()} />, { show: NONE_IN_PANEL });
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
  render: () => <QuestsScene {...QUESTS.today} onNavigate={fn()} onDayChange={fn()} onTab={fn()} onClaim={fn()} onClaimAll={fn()} />,
};
