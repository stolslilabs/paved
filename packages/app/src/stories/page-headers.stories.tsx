import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CAMPAIGNS, EMPTY_PROGRESS } from "@paved/game-core";
import { titleOf } from "../lib/music/track-info";
import { TRACKS } from "../lib/music/tracks";
import { appRenders } from "../mocks/assets";
import { PROGRESS } from "../mocks/players";
import { AVATAR_CREATOR, COBBLES, MISSIONS, MY_TILES, PLAY, PROFILE, PURCHASE, REFERRAL, SETTINGS, THEME, THEME_SHOP, VAULT, WELCOME } from "../mocks/scenes";
import { BalancesProvider } from "../components/containers/balances-context";
import { ProfileProvider } from "../components/containers/profile-context";
import { AvatarCreatorScene } from "../components/scenes/avatar-creator-scene";
import { VillageChestsScene } from "../components/scenes/village-chests-scene";
import { VillageLayoutScene } from "../components/scenes/village-layout-scene";
import { VillageShopScene } from "../components/scenes/village-shop-scene";
import { VILLAGE_CHESTS, VILLAGE_LAYOUT, VILLAGE_SHOP } from "../mocks/village-v2";
import { PvpLeagueScene } from "../components/scenes/pvp-league-scene";
import { PvpResultScene } from "../components/scenes/pvp-result-scene";
import { PVP_LEAGUE, PVP_RESULT } from "../mocks/pvp";
import { CobblesScene } from "../components/scenes/cobbles-scene";
import { CreditsScene } from "../components/scenes/credits-scene";
import { MyTilesScene } from "../components/scenes/my-tiles-scene";
import { PlayScene } from "../components/scenes/play-scene";
import { PurchaseScene } from "../components/scenes/purchase-scene";
import { MissionsScene } from "../components/scenes/missions-scene";
import { ReferralScene } from "../components/scenes/referral-scene";
import { SettingsScene } from "../components/scenes/settings-scene";
import { StoryScene } from "../components/scenes/story-scene";
import { ThemeScene } from "../components/scenes/theme-scene";
import { ThemeShopScene } from "../components/scenes/theme-shop-scene";
import { VaultScene } from "../components/scenes/vault-scene";
import { SocialScene } from "../components/scenes/social-scene";
import { SOCIAL } from "../mocks/social";
import { WelcomeScene } from "../components/scenes/welcome-scene";
import { HEADER_BALANCES, hereOf } from "../routes/header-balances";
import { PAGE_HEADER_STORIES } from "./page-headers";

/** The balances a connected player holds. */
const BALANCES = {
  state: { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, vpaved: 1_250_400_000_000_000_000n, cobbles: 240 },
  onAction: fn(),
  onConnect: fn(),
  faucet: true,
} as const;

/**
 * The shell's avatar and balances (`ProfileHost`, `BalancesHost`), a connected player's: the page's balances (#855,
 * `header-balances.ts`: the story's first route's), none where it shows none: the header each page draws in the app.
 */
const withShell: Decorator = (Story, { id }) => {
  const route = PAGE_HEADER_STORIES[id.replace("pages-headers--", "") as keyof typeof PAGE_HEADER_STORIES]?.[0];
  const story = <Story />;
  return (
    <ProfileProvider value={{ state: PROFILE.connected, progress: PROGRESS.start, onConnect: fn(), onDisconnect: fn(), onCopy: fn(async () => {}) }}>
      {route === undefined || HEADER_BALANCES[route].length === 0 ? story : <BalancesProvider value={{ ...BALANCES, kinds: HEADER_BALANCES[route], here: hereOf(`/${route}`) }}>{story}</BalancesProvider>}
    </ProfileProvider>
  );
};

/**
 * HEADER-HEIGHT (#676), ONE-HEADER (#781): every page outside the game scenes, one story each (`page-headers.ts` lists the
 * routes each covers), in the shell's providers (the avatar, the page's balances). Each page has one header at its top
 * (`PageHeader`), `--header-h` tall, one value per breakpoint (theme.css), one row at every width: Back and the title at the top
 * left, the page's balances at the top right (#855), nothing under it. The content starts at the same height on every page but the hero
 * (Welcome); the home is a game scene since #753. `scripts/header-sweep.ts` measures both at 375 and 1440 px.
 */
const meta = { title: "Pages/Headers", decorators: [withShell], parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Play: Story = { render: () => <PlayScene {...PLAY.connected} onBack={fn()} /> };
export const Missions: Story = { render: () => <MissionsScene {...MISSIONS.daily} /> };
export const Vault: Story = { render: () => <VaultScene {...VAULT.position} /> };
export const Social: Story = { render: () => <SocialScene {...SOCIAL.badges} /> };
export const Settings: Story = { render: () => <SettingsScene {...SETTINGS.connected} /> };
export const StoryCampaigns: Story = {
  name: "Story",
  render: () => <StoryScene campaigns={CAMPAIGNS} progress={EMPTY_PROGRESS} renders={appRenders} onBack={fn()} />,
};
export const MyTiles: Story = { render: () => <MyTilesScene {...MY_TILES.owned} onBack={fn()} /> };
export const Themes: Story = { render: () => <ThemeScene {...THEME.mixed} onBack={fn()} /> };
export const ThemeShop: Story = { render: () => <ThemeShopScene {...THEME_SHOP.forest} onBack={fn()} /> };
export const Referral: Story = { render: () => <ReferralScene {...REFERRAL.earned} onBack={fn()} /> };
export const Credits: Story = { render: () => <CreditsScene tracks={TRACKS.map(titleOf)} onBack={fn()} /> };
export const Cobbles: Story = { render: () => <CobblesScene {...COBBLES.packs} onBack={fn()} /> };
export const Avatar: Story = { render: () => <AvatarCreatorScene {...AVATAR_CREATOR.saved} onBack={fn()} /> };
export const Village: Story = { render: () => <VillageLayoutScene {...VILLAGE_LAYOUT.growing} onBack={fn()} /> };
export const VillageChests: Story = { render: () => <VillageChestsScene {...VILLAGE_CHESTS.closed} onBack={fn()} /> };
export const VillageShop: Story = { render: () => <VillageShopScene {...VILLAGE_SHOP.today} onBack={fn()} /> };
export const PvpResult: Story = { render: () => <PvpResultScene {...PVP_RESULT.twoStars} /> };
export const PvpLeague: Story = { render: () => <PvpLeagueScene {...PVP_LEAGUE.bronze} onBack={fn()} /> };
export const Purchase: Story = { render: () => <PurchaseScene {...PURCHASE.stake1} onBack={fn()} /> };
export const Welcome: Story = { render: () => <WelcomeScene {...WELCOME.firstVisit} onBack={fn()} /> };
