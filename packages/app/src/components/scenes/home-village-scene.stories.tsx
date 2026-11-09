import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { PROFILE } from "../../mocks/scenes";
import { PROGRESS } from "../../mocks/players";
import { BIG_AMOUNT_18, BIG_AMOUNT_6 } from "../../mocks/stress";
import { HOME_VILLAGE } from "../../mocks/village-v2";
import { BalancesProvider } from "../containers/balances-context";
import { ProfileProvider } from "../containers/profile-context";
import { HomeVillageScene, type HomeVillageSceneProps } from "./home-village-scene";
import { CentreGuide, expectIconCentred } from "../../stories/centre-guide";
import { HudInsetGuide, SimulatedNotch, expectHudInset } from "../../stories/hud-inset-guide";
import { PHONE_320, PHONE_375, PHONE_SIDEWAYS, TABLET_768, VIEWPORT_OPTIONS, WIDE_1440 } from "./viewports";
import { HOME_STORY_META } from "./home-village-story-kit";

/**
 * Home (`/`, #753): the player's village full screen with Clash of Clans' overlays, and edit mode in the same scene. One story
 * per state of `HOME_VILLAGE` (`mocks/village-v2.ts`) on the plan view; the `Scene` stories put the real renderer under the
 * overlays (the fog, the day and night), at 375, 768 and 1440 px in view and in edit mode. The avatar and the
 * balances are the shell's (`ProfileProvider`, `BalancesProvider`).
 * The stories are split by theme, one title for all: the view and its overlays here, the states and edit mode
 * (`home-village-states.stories.tsx`), the saved layouts (`home-village-slots.stories.tsx`), the renderer's scene, the Camera mode and
 * the dock (`home-village-renderer.stories.tsx`), the fakes played and the long press (`home-village-press.stories.tsx`).
 */
const meta = {
  title: "Scenes/Home",
  ...HOME_STORY_META,
} satisfies Meta<typeof HomeVillageScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The village in view: the avatar, the balances, the right column's tiles (3 missions, 2 friends), the Chat tab and the mission above the dock. */
export const View: Story = { args: HOME_VILLAGE.view };
/** The widest balances (the balances' stress amounts) at 320 px: the profile's line narrows beside the plate, never under it (#828). */
const WIDE_BALANCES = (Story: () => React.JSX.Element) => (
  <BalancesProvider value={{ state: { status: "ready", usdc: BIG_AMOUNT_6, paved: BIG_AMOUNT_18, cobbles: 999_999 }, faucet: false }}>
    <Story />
  </BalancesProvider>
);
export const WideBalancesPhone320: Story = { ...PHONE_320, args: HOME_VILLAGE.view, decorators: [WIDE_BALANCES] };
export const WideBalancesWide1440: Story = { ...WIDE_1440, args: HOME_VILLAGE.view, decorators: [WIDE_BALANCES] };
/**
 * A short desktop window (1024 x 600): the right column's tiles centred under the balances (#856, HOME-EDGES); were it taller than
 * its band, its last tiles would wrap into a second column, to the left.
 */
export const ShortDesktop: Story = {
  args: HOME_VILLAGE.view,
  parameters: { viewport: { options: { ...VIEWPORT_OPTIONS, short: { name: "Laptop 1024 x 600", styles: { width: "1024px", height: "600px" }, type: "desktop" } } } },
  globals: { viewport: { value: "short", isRotated: false } },
};
/** The longest username (WRAP360) in the profile: the name under the level's line truncates beside the balances, never under them. */
const LONG_NAME = (Story: () => React.JSX.Element) => (
  <ProfileProvider value={{ state: PROFILE.stress, progress: PROGRESS.partWay, onCopy: fn(async () => {}) }}>
    <Story />
  </ProfileProvider>
);
/**
 * HOME-OVERLAYS (#856, the owner's decisions of 2026-10-28): the profile at 96, 108 and 144 px (the season dial's size then), no League
 * in the right column. HOME-STACK (#929, the owner's decisions of 2026-10-30): the League control and the village score stacked at
 * the top, 24 px under the profile, at every width, the chips under them. HOME-EDGES (the owner's asks of 2026-11-04, the Paved UX
 * Book's main screen): the right column's four tiles (Missions, Vault, Friends, Tiles) at every width, centred under the
 * balances; at the bottom left the Chat tab on the edge and the mission in progress, just above the dock. At 320, 375,
 * 390, 768 and 1440 px, shielded or not, and with the longest name.
 */
/** A large phone (390 x 844), one of #929's widths. */
const PHONE_390 = {
  parameters: { viewport: { options: { ...VIEWPORT_OPTIONS, phone390: { name: "iPhone 390", styles: { width: "390px", height: "844px" }, type: "mobile" } } } },
  globals: { viewport: { value: "phone390", isRotated: false } },
};
/** A short laptop (1024 x 600). */
const SHORT_1024 = {
  parameters: { viewport: { options: { ...VIEWPORT_OPTIONS, short: { name: "Laptop 1024 x 600", styles: { width: "1024px", height: "600px" }, type: "desktop" } } } },
  globals: { viewport: { value: "short", isRotated: false } },
};
export const OverlaysPhone320: Story = { ...PHONE_320, args: { ...HOME_VILLAGE.view } };
export const OverlaysPhone375: Story = { ...PHONE_375, args: { ...HOME_VILLAGE.view } };
export const OverlaysPhone390: Story = { ...PHONE_390, args: { ...HOME_VILLAGE.view } };
export const OverlaysTablet768: Story = { ...TABLET_768, args: { ...HOME_VILLAGE.view } };
export const OverlaysWide1440: Story = { ...WIDE_1440, args: { ...HOME_VILLAGE.view } };
export const OverlaysShieldedPhone320: Story = { ...PHONE_320, args: { ...HOME_VILLAGE.shielded } };
export const OverlaysShieldedPhone375: Story = { ...PHONE_375, args: { ...HOME_VILLAGE.shielded } };
export const OverlaysShieldedPhone390: Story = { ...PHONE_390, args: { ...HOME_VILLAGE.shielded } };
export const OverlaysShieldedTablet768: Story = { ...TABLET_768, args: { ...HOME_VILLAGE.shielded } };
export const OverlaysShieldedWide1440: Story = { ...WIDE_1440, args: { ...HOME_VILLAGE.shielded } };
export const OverlaysLongNamePhone320: Story = { ...PHONE_320, args: { ...HOME_VILLAGE.view }, decorators: [LONG_NAME] };
export const OverlaysLongNamePhone375: Story = { ...PHONE_375, args: { ...HOME_VILLAGE.view }, decorators: [LONG_NAME] };
export const OverlaysLongNameTablet768: Story = { ...TABLET_768, args: { ...HOME_VILLAGE.view }, decorators: [LONG_NAME] };
export const OverlaysLongNameWide1440: Story = { ...WIDE_1440, args: { ...HOME_VILLAGE.view }, decorators: [LONG_NAME] };
/** Shielded on a short laptop: the left column under the profile, never under the Chat tab. */
export const OverlaysShieldedShort1024: Story = { ...SHORT_1024, args: { ...HOME_VILLAGE.shielded } };
/**
 * HOME-STACK (#929) on the short phone (320 x 568) with every control of the left column: shielded, and the chips (Resume, the
 * spawn pause) last. The column scrolls within its band, never under the Chat tab or the bar.
 */
export const OverlaysEverythingPhone320: Story = {
  ...PHONE_320,
  args: { ...HOME_VILLAGE.shielded, activeGame: HOME_VILLAGE.resume.activeGame, spawnPaused: true },
};
/** The same at 375 px: the chips under the village score. */
export const OverlaysChipsPhone375: Story = { ...PHONE_375, args: { ...HOME_VILLAGE.view, activeGame: HOME_VILLAGE.resume.activeGame, spawnPaused: true } };
/**
 * SOCIAL-SPLIT (#973), as HOME-EDGES places them: Chat the orange tab on the left edge, Friends a tile of the right column, Guild
 * the dock's, each with its count. Three-digit counts and shielded: nothing overlaps the profile, the balances, the mission
 * or the other column. At 320, 375, 768 and 1440 px.
 */
const SOCIAL_COUNTS = { chat: 128, guild: 12, friends: 7 } satisfies Partial<HomeVillageSceneProps>;
const SOCIAL_FULL = { ...HOME_VILLAGE.shielded, ...SOCIAL_COUNTS } satisfies HomeVillageSceneProps;
export const OverlaysSocialPhone320: Story = { ...PHONE_320, args: SOCIAL_FULL };
export const OverlaysSocialPhone375: Story = { ...PHONE_375, args: SOCIAL_FULL };
export const OverlaysSocialTablet768: Story = { ...TABLET_768, args: SOCIAL_FULL };
export const OverlaysSocialWide1440: Story = { ...WIDE_1440, args: SOCIAL_FULL };
/** The same with the chips (Resume, the spawn pause) on a short laptop: the left column stops above the Chat tab. */
export const OverlaysSocialChipsShort1024: Story = { ...SHORT_1024, args: { ...SOCIAL_FULL, activeGame: HOME_VILLAGE.resume.activeGame, spawnPaused: true } };
/**
 * HOME-HUD-PADDING (the owner's request of 2026-11-03): one inset at the top and on both sides (`--hud-inset` of theme.css: 8 px on a
 * phone, 16 from `tablet`, the notch's safe area added), drawn as the red bands. The profile, the balances, the crowns' and the
 * village's capsules, the right column, the mission and the bottom row stand on it (the Chat tab runs to the edge), their painted edges on one line: at 320 and
 * 375 px, at 1440, and on a notched phone (the safe area simulated on the tokens, as `env(safe-area-inset-*)`
 * adds it). Their play reads the painted pixels (`expectHudInset`).
 */
const INSET_GUIDE = (Story: () => React.JSX.Element) => (
  <HudInsetGuide>
    <Story />
  </HudInsetGuide>
);
const NOTCHED = (top: number, side: number) => (Story: () => React.JSX.Element) => (
  <SimulatedNotch top={top} side={side}>
    <HudInsetGuide>
      <Story />
    </HudInsetGuide>
  </SimulatedNotch>
);
const insetCheck = async ({ canvasElement }: { canvasElement: HTMLElement }) => expectHudInset(canvasElement);
export const HudInsetPhone320: Story = { ...PHONE_320, args: SOCIAL_FULL, decorators: [INSET_GUIDE], play: insetCheck };
export const HudInsetPhone375: Story = { ...PHONE_375, args: SOCIAL_FULL, decorators: [INSET_GUIDE], play: insetCheck };
/** From `desktop` the layout is kept: the card and the rail's column on the inset's lines (16 px), the rail not nudged. */
export const HudInsetWide1440: Story = { ...WIDE_1440, args: SOCIAL_FULL, decorators: [INSET_GUIDE], play: async ({ canvasElement }) => expectHudInset(canvasElement, { align: false }) };
/** An iPhone's portrait notch (a 47 px safe area at the top): the inset grows by it at the top, the same for the profile and the balances. */
export const HudInsetNotchPhone375: Story = { ...PHONE_375, args: SOCIAL_FULL, decorators: [NOTCHED(47, 0)], play: insetCheck };
/** The same phone sideways (47 px safe areas at the sides, none at the top): both sides grow by it. */
export const HudInsetNotchSideways: Story = { ...PHONE_SIDEWAYS, args: SOCIAL_FULL, decorators: [NOTCHED(0, 47)], play: insetCheck };
/** A Challenge game running: the Resume chip under the top row. */
export const Resume: Story = { args: HOME_VILLAGE.resume };
/** `spawn_paused`: its notice beside the Resume chip. */
export const Paused: Story = { args: HOME_VILLAGE.paused };
/** A new player: the starter village, level 1, the League control unranked (Wood's crest, 0 crowns, #755, #829). */
export const Start: Story = { args: HOME_VILLAGE.start };
/** The village shielded (#806, #829): the shield's mirrored plate under the League control, 07h42m left; a tap tells until when. */
export const Shielded: Story = { args: HOME_VILLAGE.shielded };
/** Under an hour left: 00h42m. */
export const ShieldUnderAnHour: Story = { args: HOME_VILLAGE.shieldUnderAnHour };
/** The shield's last minute: 00h01m, never 00h00m while it is up; the plate leaves at the end. */
export const ShieldLastMinute: Story = { args: HOME_VILLAGE.shieldLastMinute };
/**
 * The left column (#829, the owner's decisions of 2026-10-27): the profile, under it the League control (the League button, the
 * crowns' capsule), the village score, then the shield's capsule while shielded (HOME-UI-CAPSULES, the mockup's order).
 * Unranked (#917's crest: no crown, no attack), a mid league and shielded, at 320, 375 and 1440 px: nothing under the balances or the
 * right column.
 */
export const LeftColumnUnrankedPhone320: Story = { ...PHONE_320, args: HOME_VILLAGE.unranked };
export const LeftColumnUnrankedPhone375: Story = { ...PHONE_375, args: HOME_VILLAGE.unranked };
export const LeftColumnUnrankedWide1440: Story = { ...WIDE_1440, args: HOME_VILLAGE.unranked };
export const LeftColumnMidLeaguePhone320: Story = { ...PHONE_320, args: HOME_VILLAGE.view };
export const LeftColumnMidLeaguePhone375: Story = { ...PHONE_375, args: HOME_VILLAGE.view };
export const LeftColumnMidLeagueWide1440: Story = { ...WIDE_1440, args: HOME_VILLAGE.view };
export const ShieldedPhone320: Story = { ...PHONE_320, args: HOME_VILLAGE.shielded };
export const ShieldedPhone375: Story = { ...PHONE_375, args: HOME_VILLAGE.shielded };
export const ShieldedWide1440: Story = { ...WIDE_1440, args: HOME_VILLAGE.shielded };
/** The widest left column at 320 px: a five-digit crown count, shielded, beside the widest balances. */
export const LeftColumnStressPhone320: Story = { ...PHONE_320, args: HOME_VILLAGE.leagueStress, decorators: [WIDE_BALANCES] };

/**
 * SWORDS-CENTRE (#827, the owner's decision of 2026-10-27): the dock's medallion (HOME-DOCK, at every width), the swords over PLAY
 * centred in it as one group, under a centre guide (two red lines through the button's centre). The play checks the group's centre
 * is the button's to half a pixel.
 */
export const PlayCentred: Story = {
  args: HOME_VILLAGE.view,
  decorators: [(Story) => <CentreGuide label="Play"><Story /></CentreGuide>],
  play: async ({ canvasElement }) => {
    // The dock is its own chunk on the home: its Play is drawn once it has come.
    await within(canvasElement).findByRole("navigation", { name: "Main" }, { timeout: 10_000 });
    await expectIconCentred(canvasElement, "Play");
  },
};
export const PlayCentredPhone375: Story = { ...PlayCentred, ...PHONE_375 };
export const PlayCentredWide1440: Story = { ...PlayCentred, ...WIDE_1440 };

/**
 * HOME-BUTTONS (#856): the dock's Play and Settings and Edit at the bottom right take the pointer at every
 * width. The play checks that the topmost element at each drawn button's centre is the button (not the village under the overlays'
 * pass-through), then clicks it: Play and Settings are the dock's at every width (HOME-DOCK).
 */
export const ButtonsReachable: Story = {
  args: { ...HOME_VILLAGE.view },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("navigation", { name: "Main" }, { timeout: 10_000 }).catch(() => null);
    const drawn = (el: HTMLElement) => el.getClientRects().length > 0 && el.checkVisibility({ visibilityProperty: true });
    const reach = async (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const top = el.ownerDocument.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      await expect(top && el.contains(top)).toBe(true);
      await userEvent.click(el);
    };
    for (const name of ["Play", "Settings"]) {
      const [button] = canvas.getAllByRole("button", { name }).filter(drawn);
      await reach(button!);
    }
    // HOME-EDGES: the right column's tiles, the Chat tab, the mission in progress; the village score's capsule opens edit mode.
    const tiles = await canvas.findByRole("navigation", { name: "Village" }, { timeout: 10_000 });
    for (const tile of within(tiles).getAllByRole("button")) await reach(tile);
    await reach(canvas.getByRole("button", { name: /^Chat/ }));
    await reach(canvas.getByRole("button", { name: /^Public Works/ }));
    await reach(canvas.getByRole("button", { name: /^Edit village, score/ }));
    await expect(args.onNavigate).toHaveBeenCalledWith("play");
    await expect(args.onNavigate).toHaveBeenCalledWith("settings");
    for (const handler of [args.onMissions, args.onVault, args.onFriends, args.onTiles, args.onChat]) await expect(handler).toHaveBeenCalled();
    await expect(args.onEditingChange).toHaveBeenCalledWith(true);
  },
};
export const ButtonsReachablePhone320: Story = { ...ButtonsReachable, ...PHONE_320 };
export const ButtonsReachablePhone375: Story = { ...ButtonsReachable, ...PHONE_375 };
export const ButtonsReachableWide1440: Story = { ...ButtonsReachable, ...WIDE_1440 };
