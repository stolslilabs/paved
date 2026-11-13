import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CAMPAIGNS, EMPTY_PROGRESS } from "@paved/game-core";
import { appRenders } from "../mocks/assets";
import { PROGRESS } from "../mocks/players";
import { AVATAR_CREATOR, MISSIONS, PLAY, PROFILE, PURCHASE, REFERRAL, SETTINGS, THEME, TILES, VAULT } from "../mocks/scenes";
import { BalancesProvider } from "../components/containers/balances-context";
import { ProfileProvider } from "../components/containers/profile-context";
import { AvatarCreatorScene } from "../components/scenes/avatar-creator-scene";
import { VillageLayoutScene } from "../components/scenes/village-layout-scene";
import { ShopScene } from "../components/scenes/shop-scene";
import { SHOP } from "../mocks/shop";
import { VILLAGE_LAYOUT } from "../mocks/village-v2";
import { PvpLeagueScene } from "../components/scenes/pvp-league-scene";
import { PvpMatchScene } from "../components/scenes/pvp-match-scene";
import { PVP_MATCH } from "../mocks/pvp-match";
import { PvpResultScene } from "../components/scenes/pvp-result-scene";
import { PVP_LEAGUE, PVP_RESULT } from "../mocks/pvp";
import { TilesScene } from "../components/scenes/tiles-scene";
import { PlayScene } from "../components/scenes/play-scene";
import { PurchaseScene } from "../components/scenes/purchase-scene";
import { MissionsScene } from "../components/scenes/missions-scene";
import { ReferralScene } from "../components/scenes/referral-scene";
import { SettingsScene } from "../components/scenes/settings-scene";
import { StoryScene } from "../components/scenes/story-scene";
import { PuzzleScene } from "../components/scenes/puzzle-scene";
import { ExpeditionScene } from "../components/scenes/expedition-scene";
import { EXPEDITION } from "../mocks/expedition";
import { JoustScene } from "../components/scenes/joust-scene";
import { MasterpieceScene } from "../components/scenes/masterpiece-scene";
import { MASTERPIECE } from "../mocks/masterpiece";
import { JOUST } from "../mocks/joust";
import { ColossusScene } from "../components/scenes/colossus-scene";
import { COLOSSUS } from "../mocks/colossus";
import { TournamentScene } from "../components/scenes/tournament-scene";
import { TOURNAMENT } from "../mocks/tournament";
import { PUZZLE } from "../mocks/puzzle";
import { ThemeScene } from "../components/scenes/theme-scene";
import { VaultScene } from "../components/scenes/vault-scene";
import { ChatScene } from "../components/scenes/chat-scene";
import { FriendsScene } from "../components/scenes/friends-scene";
import { GuildScene } from "../components/scenes/guild-scene";
import { Skeleton } from "../components/ui/skeleton";
import { LeaderboardScene } from "../components/scenes/leaderboard-scene";
import { LEADERBOARD } from "../mocks/ranking";
import { FRIENDS_SEARCH } from "../mocks/social";
import { HEADER_BALANCES, hereOf } from "../routes/header-balances";
import { PAGE_HEADER_STORIES } from "./page-headers";

/** The balances a connected player holds. */
const BALANCES = {
  state: { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, vpaved: 1_250_400_000_000_000_000n, cobbles: 240 },
  onAction: fn(),
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
    <ProfileProvider value={{ state: PROFILE.connected, progress: PROGRESS.start, onCopy: fn(async () => {}) }}>
      {route === undefined || HEADER_BALANCES[route].length === 0 ? story : <BalancesProvider value={{ ...BALANCES, kinds: HEADER_BALANCES[route], here: hereOf(`/${route}`) }}>{story}</BalancesProvider>}
    </ProfileProvider>
  );
};

/**
 * HEADER-HEIGHT (#676), ONE-HEADER (#781): every page outside the game scenes, one story each (`page-headers.ts` lists the
 * routes each covers), in the shell's providers (the avatar, the page's balances). Each page has one header at its top
 * (`PageHeader`), `--header-h` tall, one value per breakpoint (theme.css), one row at every width: Back and the title at the top
 * left, the page's balances at the top right (#855), nothing under it. The content starts at the same height on every page but the hero
 * (none since the welcome left: NO-GUEST); the home is a game scene since #753. `scripts/header-sweep.ts` measures both at 375 and 1440 px.
 */
const meta = { title: "Pages/Headers", decorators: [withShell], parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Play: Story = { render: () => <PlayScene {...PLAY.connected} onBack={fn()} /> };
export const Missions: Story = { render: () => <MissionsScene {...MISSIONS.daily} /> };
export const Tiles: Story = { render: () => <TilesScene {...TILES.owned} onBack={fn()} /> };
export const Vault: Story = { render: () => <VaultScene {...VAULT.position} /> };
/** The social pages as they open, their body loading (the app's own wait while the account is read): the header is what is compared. */
const loading = <Skeleton aria-busy className="h-40 rounded-xl" />;
export const Chat: Story = { render: () => <ChatScene>{loading}</ChatScene> };
export const Guild: Story = { render: () => <GuildScene>{loading}</GuildScene> };
export const Friends: Story = { render: () => <FriendsScene {...FRIENDS_SEARCH.idle}>{loading}</FriendsScene> };
export const Ranking: Story = { render: () => <LeaderboardScene {...LEADERBOARD.playersInView} /> };
export const Settings: Story = { render: () => <SettingsScene {...SETTINGS.connected} /> };
export const StoryCampaigns: Story = {
  name: "Story",
  // STORY-PAGE: a view of Play's drawer, as the stake.
  render: () => <PlayScene {...PLAY.connected} story={<StoryScene campaigns={CAMPAIGNS} progress={EMPTY_PROGRESS} renders={appRenders} />} onBack={fn()} onStoryBack={fn()} />,
};
// The Puzzle (Play's Limited mode): a view of Play's drawer, as Story's campaigns, the Cobbles at its band's end.
export const Puzzle: Story = { render: () => <PlayScene {...PLAY.connected} puzzle={<PuzzleScene {...PUZZLE.today} />} onBack={fn()} onPuzzleBack={fn()} /> };
export const Joust: Story = { render: () => <PlayScene {...PLAY.connected} joust={<JoustScene {...JOUST.live} />} onBack={fn()} onJoustBack={fn()} /> };
export const Expedition: Story = { render: () => <PlayScene {...PLAY.connected} expedition={<ExpeditionScene {...EXPEDITION.board} />} onBack={fn()} onExpeditionBack={fn()} /> };
export const Masterpiece: Story = { render: () => <PlayScene {...PLAY.connected} masterpiece={<MasterpieceScene {...MASTERPIECE.board} />} onBack={fn()} onMasterpieceBack={fn()} /> };
export const Colossus: Story = { render: () => <PlayScene {...PLAY.connected} colossus={<ColossusScene {...COLOSSUS.site} />} onBack={fn()} onColossusBack={fn()} /> };
export const Tournament: Story = { render: () => <PlayScene {...PLAY.connected} tournament={<TournamentScene {...TOURNAMENT.duel} />} onBack={fn()} onTournamentBack={fn()} /> };
// Settings' views (SETTINGS-PAGE): Themes and Credits in its drawer, its band's Back and red cross.
export const Themes: Story = { render: () => <SettingsScene {...SETTINGS.connected} view="themes" themes={<ThemeScene {...THEME.mixed} />} /> };
export const Referral: Story = { render: () => <ReferralScene {...REFERRAL.earned} onBack={fn()} /> };
export const Credits: Story = { render: () => <SettingsScene {...SETTINGS.credits} /> };
export const Avatar: Story = { render: () => <AvatarCreatorScene {...AVATAR_CREATOR.saved} onBack={fn()} /> };
export const Village: Story = { render: () => <VillageLayoutScene {...VILLAGE_LAYOUT.growing} onBack={fn()} /> };
// The Shop (SHOP-PAGE) on its Cobbles tab, which shows the page's whole set, the Cobbles and USDC.
export const VillageShop: Story = { render: () => <ShopScene {...SHOP.picked} onBack={fn()} /> };
export const PvpResult: Story = { render: () => <PvpResultScene {...PVP_RESULT.twoStars} /> };
export const PvpLeague: Story = { render: () => <PvpLeagueScene {...PVP_LEAGUE.bronze} onBack={fn()} /> };
export const PvpMatch: Story = { render: () => <PvpMatchScene {...PVP_MATCH.attackBuild} onBack={fn()} /> };
// Play's stake (PLAY-PAGE): a panel of its own in the drawer, in the modes' place.
export const Purchase: Story = { render: () => <PlayScene {...PLAY.connected} challenge={<PurchaseScene {...PURCHASE.stake1} />} onBack={fn()} onChallengeBack={fn()} /> };
