import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CAMPAIGNS, EMPTY_PROGRESS } from "@paved/game-core";
import { titleOf } from "../lib/music/track-info";
import { TRACKS } from "../lib/music/tracks";
import { UPCOMING_CAMPAIGNS } from "../data/story";
import { appRenders } from "../mocks/assets";
import { PROGRESS } from "../mocks/players";
import { COBBLES, HOME, MY_TILES, PLAY, PROFILE, PURCHASE, QUESTS, REFERRAL, SETTINGS, THEME, THEME_SHOP, VAULT, WELCOME } from "../mocks/scenes";
import { BalancesProvider } from "../components/containers/balances-context";
import { ProfileProvider } from "../components/containers/profile-context";
import { CobblesScene } from "../components/scenes/cobbles-scene";
import { CreditsScene } from "../components/scenes/credits-scene";
import { HomeScene } from "../components/scenes/home-scene";
import { MyTilesScene } from "../components/scenes/my-tiles-scene";
import { PlayScene } from "../components/scenes/play-scene";
import { PurchaseScene } from "../components/scenes/purchase-scene";
import { QuestsScene } from "../components/scenes/quests-scene";
import { ReferralScene } from "../components/scenes/referral-scene";
import { SettingsScene } from "../components/scenes/settings-scene";
import { StoryScene } from "../components/scenes/story-scene";
import { ThemeScene } from "../components/scenes/theme-scene";
import { ThemeShopScene } from "../components/scenes/theme-shop-scene";
import { VaultScene } from "../components/scenes/vault-scene";
import { WelcomeScene } from "../components/scenes/welcome-scene";

/** The shell's avatar and balances (`ProfileHost`, `BalancesHost`), a connected player's: the fullest header a page draws. */
const withShell: Decorator = (Story) => (
  <ProfileProvider value={{ state: PROFILE.connected, progress: PROGRESS.start, onConnect: fn(), onDisconnect: fn(), onCopy: fn(async () => {}) }}>
    <BalancesProvider value={{ state: { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, vpaved: 1_250_400_000_000_000_000n, cobbles: 240 }, onAction: fn(), onConnect: fn(), faucet: true }}>
      <Story />
    </BalancesProvider>
  </ProfileProvider>
);

/**
 * HEADER-HEIGHT (#676): every page outside the board, one story each, in the shell's providers (the avatar, the balances).
 * Each page's header, the one marked `data-slot="page-header"` (the `TopBar`, the tab pages' title row, Home's top row, and
 * from `desktop` the navigation's header), is `--header-h` tall, one value per breakpoint (theme.css), so the content starts
 * at the same height on every page. `scripts/header-sweep.ts` measures them at 375 and 1440 px.
 */
const meta = { title: "Pages/Headers", decorators: [withShell], parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = { render: () => <HomeScene {...HOME.connected} /> };
export const Play: Story = { render: () => <PlayScene {...PLAY.connected} onBack={fn()} /> };
export const Missions: Story = { render: () => <QuestsScene {...QUESTS.today} /> };
export const Vault: Story = { render: () => <VaultScene {...VAULT.position} /> };
export const Settings: Story = { render: () => <SettingsScene {...SETTINGS.connected} /> };
export const StoryCampaigns: Story = {
  name: "Story",
  render: () => <StoryScene campaigns={CAMPAIGNS} progress={EMPTY_PROGRESS} renders={appRenders} upcoming={UPCOMING_CAMPAIGNS} onBack={fn()} />,
};
export const MyTiles: Story = { render: () => <MyTilesScene {...MY_TILES.owned} onBack={fn()} /> };
export const Themes: Story = { render: () => <ThemeScene {...THEME.mixed} onBack={fn()} /> };
export const ThemeShop: Story = { render: () => <ThemeShopScene {...THEME_SHOP.forest} onBack={fn()} /> };
export const Referral: Story = { render: () => <ReferralScene {...REFERRAL.earned} onBack={fn()} /> };
export const Credits: Story = { render: () => <CreditsScene tracks={TRACKS.map(titleOf)} onBack={fn()} /> };
export const Cobbles: Story = { render: () => <CobblesScene {...COBBLES.packs} onBack={fn()} /> };
export const Purchase: Story = { render: () => <PurchaseScene {...PURCHASE.stake1} onBack={fn()} /> };
export const Welcome: Story = { render: () => <WelcomeScene {...WELCOME.firstVisit} /> };
