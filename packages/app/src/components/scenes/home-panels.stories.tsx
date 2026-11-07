import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PVP_LEAGUE } from "../../mocks/pvp";
import { COBBLES, HALL_OF_FAME, MISSIONS, PLAY, PLAYER_STATUS, RECORDS, SETTINGS, THEME, VAULT } from "../../mocks/scenes";
import { PROGRESS } from "../../mocks/players";
import { HOME_VILLAGE } from "../../mocks/village-v2";
import { BalancesProvider } from "../containers/balances-context";
import PagePanel from "../containers/page-panel";
import { ProfileProvider, type ProfileValue } from "../containers/profile-context";
import { CobblesScene } from "./cobbles-scene";
import { HomeVillageScene, type HomeVillageSceneProps } from "./home-village-scene";
import { PlayScene } from "./play-scene";
import { PvpLeagueScene } from "./pvp-league-scene";
import { MissionsScene } from "./missions-scene";
import { ShopScene } from "./shop-scene";
import { SHOP } from "../../mocks/shop";
import { SettingsScene } from "./settings-scene";
import { ThemeScene } from "./theme-scene";
import { VaultScene } from "./vault-scene";
import { PHONE_320, PHONE_375, TABLET_768, WIDE_1440 } from "./viewports";


const tileArt = originalTileArt(SOURCE_ASSETS);

/**
 * DESK-PANELS (#762, the owner's decisions of 2026-10-25): from `desktop` the overlay's pages open in a side panel on the right,
 * over the village (the League's on the left, #829; dimmed; a click on it or Escape closes it, no close button since #782), laid out as on a phone. One story per page of the
 * overlay at 1440 px (the Viewport toolbar can switch it; below `desktop` the app draws these pages full screen instead); the
 * home's Cobbles in every panel's header (ONE-HEADER, #781). No page opens another (BACK-RULE, #783): the defence log is a
 * section of the League, and the themes are a sheet over Settings' panel. The profile opens on the left. The village is the plan view (the `Scene` stories of `Scenes/Home` have the 3D).
 * DOCK-UNDER-PAGES (the owner's ask of 2026-11-04): the dock stays under every page, veiled and blurred with the village: the `Dock` stories check it.
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

/** The shell's profile, its whole page (PROFILE-PAGE): the league, the follows, the actions, the Hall of Fame and the Stats. */
const PROFILE_VALUE = {
  state: { status: "connected", data: PLAYER_STATUS },
  progress: PROGRESS.partWay,
  league: { crowns: 1_240, league: 5, unranked: false },
  follows: { followers: 12, followed: 9 },
  hallOfFame: HALL_OF_FAME,
  records: RECORDS,
  onCopy: fn(async () => {}),
  onEditName: fn(),
  onEditAvatar: fn(),
  onOpenLeague: fn(),
  onOpenTiles: fn(),
  onOpenInvite: fn(),
} satisfies ProfileValue;

/** The shell's providers (the avatar, the balances), the home and, open over it, the panel (`title`), or a drawer's page (none). */
function HomeWith({ args, title, top = true, side, children }: { args: HomeVillageSceneProps; title?: string; top?: boolean; side?: "left"; children?: ReactNode }) {
  return (
    <ProfileProvider value={PROFILE_VALUE}>
      <BalancesProvider value={{ state: { status: "ready", usdc: 100_000_000n, paved: 129_110_000_000_000_000_000n, cobbles: 640 }, faucet: false }}>
        <HomeVillageScene {...args} />
        {title ? (
          <PagePanel open title={title} top={top} side={side} onClose={fn()}>
            {children}
          </PagePanel>
        ) : (
          children
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

/** Missions' drawer over the home (MISSIONS-PAGE): the HUD's drawer, as the profile's, at every width. */
const missions = () => <MissionsScene {...MISSIONS.daily} onBack={fn()} onClaimQuest={fn()} onClaimAchievement={fn()} />;

/**
 * Missions (#832; MISSIONS-PAGE, the Paved UX Book's): the HUD's drawer docked at the right, under the right column's Missions: the
 * selected mission's card, the Tutorial, Daily, Weekly and Achievements medallions, the Cobbles they earn at the header's end.
 */
export const Missions: Story = { render: (args) => <HomeWith args={args}>{missions()}</HomeWith> };

/** The Shop's drawer over the home (SHOP-PAGE): Tiles, Cobbles and Themes as tabs, the HUD's drawer at the right, as Missions. */
const shop = (state: keyof typeof SHOP = "tiles") => <ShopScene {...SHOP[state]} onBack={fn()} onTab={fn()} onThemeBack={fn()} />;
export const Shop: Story = { render: (args) => <HomeWith args={args}>{shop()}</HomeWith> };
export const ShopCobbles: Story = { render: (args) => <HomeWith args={args}>{shop("picked")}</HomeWith> };
export const ShopThemes: Story = { render: (args) => <HomeWith args={args}>{shop("themes")}</HomeWith> };
/**
 * The Vault's drawer over the home (VAULT-PAGE): the HUD's drawer docked at the right, as the Shop; its Position tab, PAVED over
 * vPAVED at its header's end.
 */
export const Vault: Story = { render: (args) => <HomeWith args={args}><VaultScene {...VAULT.position} onBack={fn()} /></HomeWith> };
/** The League's drawer over the home (LEAGUE-PAGE): the HUD's drawer, as the profile's and the Missions', at every width. */
const league = () => <PvpLeagueScene {...PVP_LEAGUE.bronze} onBack={fn()} onOpenMatch={fn()} />;

/**
 * The League (#647; LEAGUE-PAGE, the Paved UX Book's): the HUD's drawer docked at the left (#829: under the HUD's crowns, at the
 * home's top left), the leagues' carousel, the season's row, the battle logs; the crowns and the crest at the header's end.
 */
export const League: Story = { render: (args) => <HomeWith args={args}>{league()}</HomeWith> };
/**
 * Settings' drawer over the home (SETTINGS-PAGE, the Paved UX Book's Settings): the HUD's drawer at the right, as the Shop; its views
 * (the quality's choice, Credits, Themes) open in it.
 */
const settings = (view?: "credits" | "themes") => (
  <SettingsScene
    {...SETTINGS.connected}
    view={view}
    themes={view === "themes" && <ThemeScene {...THEME.mixed} onUse={fn()} onOpen={fn()} />}
    onChange={fn()}
    onView={fn()}
    onViewBack={fn()}
    onBack={fn()}
  />
);
export const Settings: Story = { render: (args) => <HomeWith args={args}>{settings()}</HomeWith> };
/** More › Themes, a view of the drawer: Back to Settings, the red cross, the Cobbles at the header's end. */
export const Themes: Story = { render: (args) => <HomeWith args={args}>{settings("themes")}</HomeWith> };
/** Play's mode choice (the games themselves open full screen). */
export const Play: Story = panel("Play", <PlayScene {...PLAY.connected} onBack={fn()} onChallenge={fn()} onTraining={fn()} onStory={fn()} onAttack={fn()} />);
/** The Cobble packs, from the balances. */
export const Cobbles: Story = panel("Cobbles", <CobblesScene {...COBBLES.packs} onBack={fn()} onSelectPack={fn()} onBuyPack={fn()} />);

/**
 * The dock under the open page (DOCK-UNDER-PAGES): what the screen shows over the dock's band and over the PLAY medallion is the
 * page or its veil, never the dock, and the veil blurs what it covers.
 */
async function expectDockUnder(canvasElement: HTMLElement) {
  const doc = canvasElement.ownerDocument;
  // The dock's chunk may still be on its way.
  await waitFor(() => {
    const nav = doc.querySelector<HTMLElement>('nav[aria-label="Main"]');
    expect(nav).not.toBeNull();
    const band = nav!.getBoundingClientRect();
    for (const [x, y] of [
      [band.left + band.width * 0.12, band.bottom - 12],
      [band.left + band.width * 0.88, band.bottom - 12],
      [band.left + band.width / 2, band.top - 8],
    ]) {
      const hit = doc.elementFromPoint(x, y);
      expect(hit).not.toBeNull();
      expect(nav!.contains(hit)).toBe(false);
    }
  }, { timeout: 5000 });
  const veil = doc.querySelector<HTMLElement>("[data-slot=sheet-overlay]");
  if (veil && getComputedStyle(veil).display !== "none") expect(getComputedStyle(veil).backdropFilter).toContain("blur");
}

/** Opens the profile from the avatar and waits for its page in place (its slide over). */
async function openProfile(canvasElement: HTMLElement) {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: /^Profile/ }));
  const page = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Profile" });
  await waitFor(() => expect(Math.round(page.getBoundingClientRect().left)).toBe(0), { timeout: 5000 });
  return page;
}

/** The profile (PROFILE-DRAWER), from the avatar: its side panel on the left (#624), the dock under its veil. */
export const Profile: Story = {
  render: (args) => <HomeWith args={args} />,
  play: async ({ canvasElement }) => {
    await openProfile(canvasElement);
  },
};

/** On a phone, a full page with Back (the owner's asks of 2026-11-04), over the dock: no dock in view. */
export const DockUnderProfilePhone320: Story = {
  ...PHONE_320,
  render: (args) => <HomeWith args={args} />,
  play: async ({ canvasElement }) => {
    const page = await openProfile(canvasElement);
    expect(within(page).getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(within(page).queryByRole("button", { name: "Close" })).toBeNull();
    await expectDockUnder(canvasElement);
  },
};

/** From `tablet` the side panel, over the dock at 768 px: the dock under the veil, blurred with the village. */
export const DockUnderProfileTablet768: Story = {
  ...TABLET_768,
  render: (args) => <HomeWith args={args} />,
  play: async ({ canvasElement }) => {
    const page = await openProfile(canvasElement);
    expect(within(page).getByRole("button", { name: "Close" })).toBeInTheDocument();
    await expectDockUnder(canvasElement);
  },
};

/** At 1024 px the dock runs under Missions' side panel's foot (DOCK-UNDER-PAGES): the panel covers it, the veil blurs the rest of it. */
export const DockUnderMissionsDesktop1024: Story = {
  render: (args) => <HomeWith args={args}>{missions()}</HomeWith>,
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvasElement }) => {
    const page = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Missions" });
    expect(within(page).getByRole("button", { name: "Close" })).toBeInTheDocument();
    await expectDockUnder(canvasElement);
  },
};

/** On a phone, Missions is a full page with Back over the home (MISSIONS-PAGE, the profile's pattern), covering the dock. */
/** On a phone, the League is a full page with Back over the home (LEAGUE-PAGE, the profile's pattern), covering the dock. */
export const LeaguePhone: Story = {
  ...PHONE_375,
  render: (args) => <HomeWith args={args}>{league()}</HomeWith>,
  play: async ({ canvasElement }) => {
    const page = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "League" });
    expect(within(page).getByRole("button", { name: "Back" })).toBeInTheDocument();
  },
};

export const ShopPhone: Story = {
  ...PHONE_375,
  render: (args) => <HomeWith args={args}>{shop()}</HomeWith>,
  play: async ({ canvasElement }) => {
    const page = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Shop" });
    expect(within(page).getByRole("button", { name: "Back" })).toBeInTheDocument();
  },
};

export const MissionsPhone: Story = {
  ...PHONE_375,
  render: (args) => <HomeWith args={args}>{missions()}</HomeWith>,
  play: async ({ canvasElement }) => {
    const page = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Missions" });
    expect(within(page).getByRole("button", { name: "Back" })).toBeInTheDocument();
  },
};
