import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PVP_LEAGUE } from "../../mocks/pvp";
import { COBBLES, HALL_OF_FAME, MISSIONS, PLAY, PLAYER_STATUS, RECORDS, SETTINGS, THEME, VAULT } from "../../mocks/scenes";
import { PROGRESS } from "../../mocks/players";
import { HOME_VILLAGE, VILLAGE_CHESTS, VILLAGE_SHOP } from "../../mocks/village-v2";
import { BalancesProvider } from "../containers/balances-context";
import { DOCK_REACH_PX } from "../elements/dock-room";
import PagePanel from "../containers/page-panel";
import PageSheet from "../containers/page-sheet";
import { ProfileProvider, type ProfileValue } from "../containers/profile-context";
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
import { PHONE_320, PHONE_375, TABLET_768, WIDE_1440 } from "./viewports";


const tileArt = originalTileArt(SOURCE_ASSETS);

/**
 * DESK-PANELS (#762, the owner's decisions of 2026-10-25): from `desktop` the overlay's pages open in a side panel on the right,
 * over the village (the League's on the left, #829; dimmed; a click on it or Escape closes it, no close button since #782), laid out as on a phone. One story per page of the
 * overlay at 1440 px (the Viewport toolbar can switch it; below `desktop` the app draws these pages full screen instead); the
 * home's Cobbles in every panel's header (ONE-HEADER, #781). No page opens another (BACK-RULE, #783): the defence log is a
 * section of the League, and the themes are a sheet over Settings' panel. The profile opens on the left. The village is the plan view (the `Scene` stories of `Scenes/Home` have the 3D).
 * The dock stays over every page (the owner's ask of 2026-11-04), which leaves it room at its end: the `Dock` stories check both.
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

/** The shell's profile, its whole page (PROFILE-PAGE): the league, the follows, the actions, the Hall of Fame and the Stats. */
const PROFILE_VALUE = {
  state: { status: "connected", data: PLAYER_STATUS },
  progress: PROGRESS.partWay,
  league: { crowns: 1_240, league: 5, unranked: false },
  follows: { followers: 12, followed: 9 },
  hallOfFame: HALL_OF_FAME,
  records: RECORDS,
  onConnect: fn(),
  onCopy: fn(async () => {}),
  onEditName: fn(),
  onEditAvatar: fn(),
  onOpenLeague: fn(),
  onOpenTiles: fn(),
  onOpenInvite: fn(),
} satisfies ProfileValue;

/** The shell's providers (the avatar, the balances), the home and, open over it, the panel. */
function HomeWith({ args, title, top = true, side, children }: { args: HomeVillageSceneProps; title?: string; top?: boolean; side?: "left"; children?: ReactNode }) {
  return (
    <ProfileProvider value={PROFILE_VALUE}>
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

/**
 * The dock over the open page, live: what the screen shows over the dock's band and over the PLAY medallion is the dock. Then the
 * page's body scrolled to its end: its last line (`last`) a gap above the dock's reach.
 */
async function expectDockOver(scroller: HTMLElement, last: HTMLElement) {
  const doc = scroller.ownerDocument;
  // The dock's chunk may still be on its way.
  await waitFor(() => {
    const nav = doc.querySelector<HTMLElement>("[data-dock] nav");
    expect(nav).not.toBeNull();
    const band = nav!.getBoundingClientRect();
    for (const [x, y] of [
      [band.left + band.width * 0.12, band.bottom - 12],
      [band.left + band.width * 0.88, band.bottom - 12],
      [band.left + band.width / 2, band.top - 8],
    ]) {
      expect(doc.elementFromPoint(x, y)?.closest("[data-dock]")).not.toBeNull();
    }
  }, { timeout: 5000 });
  scroller.scrollTop = scroller.scrollHeight;
  await waitFor(() => expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(doc.documentElement.clientHeight - DOCK_REACH_PX));
}

/** The profile's last section: the Stats' last structure type. */
const lastSection = (page: HTMLElement) => [...page.querySelectorAll<HTMLElement>("[data-slot=profile-structure]")].at(-1)!;

/** Opens the profile from the avatar and waits for its page in place (its slide over). */
async function openProfile(canvasElement: HTMLElement) {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: /^Profile/ }));
  const page = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Profile" });
  await waitFor(() => expect(Math.round(page.getBoundingClientRect().left)).toBe(0), { timeout: 5000 });
  return page;
}

/** The profile (PROFILE-DRAWER), from the avatar: its side panel on the left (#624), the dock over its foot. */
export const Profile: Story = {
  render: (args) => <HomeWith args={args} />,
  play: async ({ canvasElement }) => {
    await openProfile(canvasElement);
  },
};

/** On a phone, a full page with Back (the owner's asks of 2026-11-04); the dock stays over it, and its end scrolls clear of the dock. */
export const DockOverProfilePhone320: Story = {
  ...PHONE_320,
  render: (args) => <HomeWith args={args} />,
  play: async ({ canvasElement }) => {
    const page = await openProfile(canvasElement);
    expect(within(page).getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(within(page).queryByRole("button", { name: "Close" })).toBeNull();
    await expectDockOver(page.querySelector<HTMLElement>("[data-hud-drawer-body]")!, lastSection(page));
  },
};

/** From `tablet` the side panel, under the dock's PLAY medallion at 768 px: its end scrolls clear of it too. */
export const DockOverProfileTablet768: Story = {
  ...TABLET_768,
  render: (args) => <HomeWith args={args} />,
  play: async ({ canvasElement }) => {
    const page = await openProfile(canvasElement);
    expect(within(page).getByRole("button", { name: "Close" })).toBeInTheDocument();
    await expectDockOver(page.querySelector<HTMLElement>("[data-hud-drawer-body]")!, lastSection(page));
  },
};

/** At 1024 px the dock runs under the right panel's foot: it stays over it, and Missions' end scrolls clear of it. */
export const DockOverPanelDesktop1024: Story = {
  ...panel("Missions", <MissionsScene {...MISSIONS.daily} onNavigate={fn()} onClaimQuest={fn()} onClaimAchievement={fn()} />),
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvasElement }) => {
    const panelEl = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Missions" });
    const scroller = panelEl.querySelector<HTMLElement>("[data-slot=page-scroll]")!;
    await waitFor(() => expect(scroller.querySelector("main")?.lastElementChild).not.toBeNull());
    await expectDockOver(scroller, scroller.querySelector("main")!.lastElementChild as HTMLElement);
  },
};

/** Below `desktop` the same page is a full page with the phone's bar (#763), not a panel: Missions at 375 px, for comparison. */
export const MissionsPhone: Story = {
  ...PHONE_375,
  render: () => <MissionsScene {...MISSIONS.daily} onNavigate={fn()} onClaimQuest={fn()} onClaimAchievement={fn()} />,
};
