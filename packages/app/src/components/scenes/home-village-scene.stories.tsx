import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { BoardTile } from "@paved/chain";
import type { GameScene } from "@paved/renderer";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import { useBoardSettings } from "../../data/board-settings";
import { APP_ASSETS, originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { SAVED_LOOK } from "../../mocks/avatar";
import { HALL_OF_FAME, PLAYER_STATUS, PROFILE, RECORDS } from "../../mocks/scenes";
import { PROGRESS } from "../../mocks/players";
import { BIG_AMOUNT_18, BIG_AMOUNT_6 } from "../../mocks/stress";
import { HOME_VILLAGE, INVENTORY_LONG, LAYOUT_FULL, LAYOUT_GROWING, LAYOUT_SLOTS } from "../../mocks/village-v2";
import { BalancesProvider } from "../containers/balances-context";
import type { LayoutSaved } from "../containers/layout-editor";
import { layoutScore } from "../containers/layout-rules";
import type { LayoutSlot, LayoutSlotsProps } from "../containers/layout-slots-strip";
import VillageStage from "../containers/village-stage";
import type { VillageLayout } from "../containers/layout-rules";
import { ProfileProvider } from "../containers/profile-context";
import { BoardViewport } from "../containers/board-viewport";
import type { LayoutBoardView } from "../containers/layout-board";
import { useFramedSettings, useLayoutCanvas } from "../containers/village-layout-canvas";
import { HomeVillageScene, type HomeVillageSceneProps } from "./home-village-scene";
import { CentreGuide, expectIconCentred } from "../../stories/centre-guide";
import { HudInsetGuide, SimulatedNotch, expectHudInset } from "../../stories/hud-inset-guide";
import { PHONE_320, PHONE_375, PHONE_SIDEWAYS, TABLET_768, VIEWPORT_OPTIONS, WIDE_1440 } from "./viewports";

/**
 * Home (`/`, #753): the player's village full screen with Clash of Clans' overlays, and edit mode in the same scene. One story
 * per state of `HOME_VILLAGE` (`mocks/village-v2.ts`) on the plan view; the `Scene` stories put the real renderer under the
 * overlays (the fog, the day and night), at 375, 768 and 1440 px in view and in edit mode. The avatar and the
 * balances are the shell's (`ProfileProvider`, `BalancesProvider`).
 */
const meta = {
  title: "Scenes/Home",
  component: HomeVillageScene,
  parameters: { layout: "fullscreen" },
  args: {
    ...HOME_VILLAGE.view,
    tileArt: originalTileArt(SOURCE_ASSETS),
    holdMs: 300,
    onEditingChange: fn(),
    onPlay: fn(),
    onMissions: fn(),
    onShop: fn(),
    onVault: fn(),
    onFriends: fn(),
    onTiles: fn(),
    onChat: fn(),
    onLeague: fn(),
    onSettings: fn(),
    onNavigate: fn(),
    onResume: fn(),
    onRetry: fn(),
    onFound: fn(),
    onSave: fn(),
    onDismissSaved: fn(),
    onDismissRefusal: fn(),
  },
  decorators: [
    // `parameters.look`: the avatar the player saved (the home's badge draws it living); none, their initial.
    (Story, { args, parameters }) => (
      <ProfileProvider
        value={{
          state: { status: "connected", data: PLAYER_STATUS },
          look: (parameters.look as bigint | undefined) ?? null,
          progress: PROGRESS.partWay,
          league: { crowns: 1_172, league: 5, unranked: false },
          follows: { followers: 12, followed: 9 },
          // The profile's Hall of Fame and Stats (PROFILE-PAGE): the app's mock, as its profile reads it.
          hallOfFame: HALL_OF_FAME,
          records: RECORDS,
          onCopy: fn(async () => {}),
          onEditAvatar: fn(),
          onOpenLeague: fn(),
          onOpenTiles: fn(),
          onOpenInvite: fn(),
        }}
      >
        <BalancesProvider value={{ state: { status: "ready", usdc: 100_000_000n, paved: 129_110_000_000_000_000_000n, cobbles: 640 }, faucet: false }}>
          <Story />
        </BalancesProvider>
      </ProfileProvider>
    ),
  ],
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

/** The scene with its edit mode in hand (the page's URL in the app). */
function EditRoundTrip(args: HomeVillageSceneProps) {
  const [editing, setEditing] = useState(false);
  return (
    <HomeVillageScene
      {...args}
      editing={editing}
      onEditingChange={(next) => {
        args.onEditingChange?.(next);
        setEditing(next);
      }}
    />
  );
}

/** The columns stand clear of the profile and the balances: their tops a gap under each, as measured (`--left-top`, `--right-top`). */
async function expectColumnsInPlace(canvasElement: HTMLElement) {
  const box = canvasElement.querySelector<HTMLElement>("[data-slot=home-overlays]")!;
  await waitFor(() => expect(box.style.getPropertyValue("--left-top")).not.toBe(""), { timeout: 5000 });
  const [profile, balances] = [...box.querySelectorAll<HTMLElement>("[data-out=u2]")].map((el) => el.getBoundingClientRect());
  const left = box.querySelector("[data-slot=scroll-region]")!.getBoundingClientRect();
  const right = box.querySelector("[data-out=r0]")!.getBoundingClientRect();
  await expect(left.top).toBeGreaterThanOrEqual(profile!.bottom);
  await expect(right.top).toBeGreaterThanOrEqual(balances!.bottom);
  // The left column's controls start under the profile, the right one's tiles under the balances.
  const score = within(box).getByRole("button", { name: /^Edit village, score/ }).getBoundingClientRect();
  await expect(score.top).toBeGreaterThanOrEqual(profile!.bottom);
  const tiles = within(box).getByRole("navigation", { name: "Village" }).getBoundingClientRect();
  await expect(tiles.top).toBeGreaterThanOrEqual(balances!.bottom);
}

/**
 * HOME-COLUMNS-AFTER-EDIT (#1068, the owner's decision of 2026-11-07: the overlay keeps its layout however the player comes back to
 * it): in and out of edit mode three times, the columns under the profile and the balances each time.
 */
export const ColumnsAfterEdit: Story = {
  ...PHONE_375,
  args: HOME_VILLAGE.view,
  render: (args) => <EditRoundTrip {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("navigation", { name: "Village" }, { timeout: 10_000 });
    await expectColumnsInPlace(canvasElement);
    for (let i = 0; i < 3; i++) {
      await userEvent.click(canvas.getByRole("button", { name: /^Edit village, score/ }));
      await userEvent.click(await canvas.findByRole("button", { name: "Leave edit mode" }, { timeout: 10_000 }));
      await canvas.findByRole("navigation", { name: "Village" }, { timeout: 10_000 });
      await expectColumnsInPlace(canvasElement);
    }
  },
};
export const ColumnsAfterEditPhone320: Story = { ...ColumnsAfterEdit, ...PHONE_320 };
export const ColumnsAfterEditWide1440: Story = { ...ColumnsAfterEdit, ...WIDE_1440 };
/** Not founded yet: the starter alone, Found in Edit's place. */
export const Unfounded: Story = { args: HOME_VILLAGE.unfounded };
/** The village on its way: the overlays paint first, over the sky. */
export const Loading: Story = { args: HOME_VILLAGE.loading };
/** The village's read failed: Retry. */
export const ReadFailed: Story = { args: HOME_VILLAGE.error };
/**
 * The save landed, back in view (#802): no notice; the score chip under the badge counts up to the new score, green, a "+N"
 * rising off it and the house popping, once.
 */
export const Saved: Story = { args: HOME_VILLAGE.saved, parameters: { reducedMotion: "never" } };
/** A save that lowered the score: the chip counts down, a "−N" dropping. */
export const SavedLower: Story = { args: HOME_VILLAGE.savedLower, parameters: { reducedMotion: "never" } };
/** A save that left the score as it was: nothing plays. */
export const SavedSame: Story = { args: HOME_VILLAGE.savedSame };
/** Reduced motion: the new score at once, with a brief colour flash; nothing moves. */
export const SavedReducedMotion: Story = { args: HOME_VILLAGE.saved, parameters: { reducedMotion: "always" } };
/** The save at 375 px and 1440 px: the chip in view, nothing over it. */
export const SavedPhone375: Story = { ...PHONE_375, args: HOME_VILLAGE.saved, parameters: { ...PHONE_375.parameters, reducedMotion: "never" } };
export const SavedWide1440: Story = { ...WIDE_1440, args: HOME_VILLAGE.saved, parameters: { reducedMotion: "never" } };
/** The same at 320 px: the notice "Layout saved · 1,960 (+1,122)" under the profile (EDIT-VILLAGE). */
export const SavedPhone320: Story = { ...PHONE_320, args: HOME_VILLAGE.saved, parameters: { ...PHONE_320.parameters, reducedMotion: "never" } };
/** Edit mode: the editor's bar (Back, the score, the slots, Reset all), the inventory and Save. */
export const Editing: Story = { args: HOME_VILLAGE.editing };
/** Edit mode's points unfolded above the inventory (#758), a line lit. */
export const EditingPoints: Story = { args: HOME_VILLAGE.editingPoints };
/** A Wonder's line lit in edit mode (#792): the wonder's tile alone, not the 8 around it, which the line still counts. */
export const EditingPointsWonder: Story = { args: HOME_VILLAGE.editingPointsWonder };
/** A tile of the lit structure lifted (#758): under the bubble, it stays lit with the rest of its structure. */
export const EditingPointsLifted: Story = { args: HOME_VILLAGE.editingPointsLifted };
/** A road in hand: its legal cells lit. */
export const Holding: Story = { args: HOME_VILLAGE.holding };
/** The road placed on a lit cell at once (no validation, #756): the bubble rotates it or sends it back to the inventory. */
export const Placing: Story = { args: HOME_VILLAGE.placing };
/** An outer tile lifted: its legal cells lit, the bubble with Cancel. */
export const Lifted: Story = { args: HOME_VILLAGE.lifted };
/** The lifted tile moved to another lit cell: Cancel puts it back. */
export const Moved: Story = { args: HOME_VILLAGE.moved };
/** Erase held (#756's Reset all): the red ring fills around the eraser (a 6 s hold here, so it can be looked at). */
export const ResetHolding: Story = {
  args: { ...HOME_VILLAGE.editing, holdMs: 6000 },
  play: async ({ canvasElement }) => {
    fireEvent.pointerDown(await within(canvasElement).findByRole("button", { name: /^Hold to erase the layout/ }), { button: 0 });
  },
};
/** Three tiles more than saved: the live score against the saved one, Save and Discard enabled. */
export const Changed: Story = { args: HOME_VILLAGE.changed };
/** Back with unsaved changes: asked first. */
export const Leaving: Story = { args: HOME_VILLAGE.leaving };
/** The chain refused the save: what happened, above the editor, the draft kept. */
export const Refused: Story = { args: HOME_VILLAGE.refused };

/** The die (#803) beside Reset all, on the browser's Web Worker: each press builds another compact village into the draft. */
export const Die: Story = { args: HOME_VILLAGE.editing };
/** The die pressed: busy, still (no spin, the owner's ask of 2026-11-08), the hint saying it builds. */
export const DieBusy: Story = { args: HOME_VILLAGE.dieBusy };
/** Past a second: "Still building…" with a cancel, under the die. */
export const DieStillBuilding: Story = { args: HOME_VILLAGE.dieSlow };
/** The die's worker failed: its message, the draft kept. */
export const DieFailed: Story = { args: HOME_VILLAGE.dieFailed };
/** The die's village on a new player's small stock, at 375 px: the 8 tiles near a 3 x 3. Press again for another. */
export const DieSmallStock: Story = { ...PHONE_375, args: HOME_VILLAGE.dieSmall };
/** The die's village on a large stock at 375 px: every one of the 28 slots used. */
export const DieLargeStock: Story = { ...PHONE_375, args: HOME_VILLAGE.dieLarge };
/** The same at 1440 px. */
export const DieLargeStockWide: Story = { ...WIDE_1440, args: HOME_VILLAGE.dieLarge };

/** Edit mode with a long inventory at 1440 px (#757): the grid wraps in the editor's column and scrolls, Save stays at its foot. */
export const EditingLongWide: Story = { ...WIDE_1440, args: { ...HOME_VILLAGE.editing, inventory: INVENTORY_LONG } };
/** The same with every slot used: the grid greyed. */
export const EditingFullWide: Story = { ...WIDE_1440, args: { ...HOME_VILLAGE.editing, village: LAYOUT_FULL, inventory: INVENTORY_LONG } };
/** Every slot used at 375 px: the carousel greyed, every visible card waiting, and it still drags and swipes. */
export const EditingFullPhone: Story = { ...PHONE_375, args: { ...HOME_VILLAGE.editing, village: LAYOUT_FULL, inventory: INVENTORY_LONG } };

/**
 * A home state with the saved layouts (#804; EDIT-VILLAGE: the carousel above the inventory, Use in the bar): the page's stage reads
 * them itself (`routes/layout-slots.ts`); the stories hand the scene's own stage the fixture's.
 */
function slots<A extends { layoutSlots: LayoutSlotsProps }>({ layoutSlots, ...args }: A) {
  return { args, render: (story: HomeVillageSceneProps) => <HomeVillageScene {...story} renderStage={(stage) => <VillageStage {...stage} layoutSlots={layoutSlots} />} /> };
}

/** The saved layouts (#804) in the carousel above the inventory: layout 1 (the village's, Active), Next on to locked layout 2. */
export const SlotsOne: Story = { ...slots(HOME_VILLAGE.slotsOne) };
export const SlotsOnePhone375: Story = { ...PHONE_375, ...slots(HOME_VILLAGE.slotsOne) };
export const SlotsOneWide1440: Story = { ...WIDE_1440, ...slots(HOME_VILLAGE.slotsOne) };
/** Three layouts, the die's village in layout 2 shown and loaded: Use in the bar, both arrows on. */
export const SlotsThree: Story = { ...slots(HOME_VILLAGE.slotsThree) };
export const SlotsThreePhone375: Story = { ...PHONE_375, ...slots(HOME_VILLAGE.slotsThree) };
export const SlotsThreeWide1440: Story = { ...WIDE_1440, ...slots(HOME_VILLAGE.slotsThree) };
/** Layout 2 locked, shown: its Purchase in its word's place (the padlock, the Cobbles and its price), Next on to layout 3. */
export const SlotsLocked: Story = { ...slots(HOME_VILLAGE.slotsLocked) };
/** Layout 3 bought before layout 2 (#1033): layout 2 shown with its Purchase, the arrows going on past it to layout 3. */
export const SlotsGap: Story = { ...slots(HOME_VILLAGE.slotsGap) };
export const SlotsGapPhone320: Story = { ...PHONE_320, ...slots(HOME_VILLAGE.slotsGap) };
/** A locked layout tapped: unlock asked first, the price and the Cobbles held. */
export const SlotsBuy: Story = { ...slots(HOME_VILLAGE.slotsBuy) };
/** The purchase on its way: the carousel waits. */
export const SlotsBuying: Story = { ...slots(HOME_VILLAGE.slotsBuying) };
/** Layout 2 bought: open and empty, shown on the village as it was: Save keeps it there, the village unchanged. */
export const SlotsBought: Story = { ...slots(HOME_VILLAGE.slotsBought) };
/** Too few Cobbles for layout 3: its unlock asked, off, and why. */
export const SlotsShort: Story = { ...slots(HOME_VILLAGE.slotsShort) };
/** Load over changes kept nowhere: asked first. */
export const SlotsLoad: Story = { ...slots(HOME_VILLAGE.slotsLoad) };
/** Use: asked first, attackers will face it. */
export const SlotsActivate: Story = { ...slots(HOME_VILLAGE.slotsActivate) };
/** Layout 2 active: the village is its layout. */
export const SlotsActivated: Story = { ...slots(HOME_VILLAGE.slotsActivated) };
/** A saved layout that no longer fits (#804 open point 4), edited: it needs tiles first, never made active. */
export const SlotsNeedsTiles: Story = { ...slots(HOME_VILLAGE.slotsNeedsTiles) };
/** A slot write refused: what happened, above the carousel. */
export const SlotsRefused: Story = { ...slots(HOME_VILLAGE.slotsRefused) };

/**
 * The slots at work, as the mock ledger answers them: buy slot 2 (the Cobbles follow), press the die, Save here, Use (the
 * village changes), then slot 1 active again. Each write lands after 400 ms.
 */
function SlotsLive(args: HomeVillageSceneProps) {
  const [slots, setSlots] = useState<LayoutSlot[]>(() => LAYOUT_SLOTS.one.slots.map((s) => ({ ...s })));
  const [active, setActive] = useState(0);
  const [cobbles, setCobbles] = useState(LAYOUT_SLOTS.one.cobbles);
  const [busy, setBusy] = useState<{ kind: "save-to" | "activate" | "buy"; slot: number } | null>(null);
  const tiles = slots[active]!.tiles ?? LAYOUT_GROWING.tiles;
  const land = (kind: "save-to" | "activate" | "buy", slot: number, change: () => void) => {
    setBusy({ kind, slot });
    setTimeout(() => {
      change();
      setBusy(null);
    }, 400);
  };
  const put = (slot: number, change: Partial<LayoutSlot>) => setSlots((all) => all.map((s) => (s.slot === slot ? { ...s, ...change } : s)));
  return (
    <HomeVillageScene
      {...args}
      village={{ ...LAYOUT_GROWING, tiles, score: layoutScore(tiles) }}
      renderStage={(stage) => (
        <VillageStage
          {...stage}
          layoutSlots={{
        active,
        slots,
        cobbles,
        busy,
        onBuy: (slot, price) =>
          land("buy", slot, () => {
            setCobbles((c) => c - price);
            put(slot, { open: true });
          }),
        onSaveTo: (slot, draft) => land("save-to", slot, () => put(slot, { tiles: draft, score: layoutScore(draft) })),
            onActivate: (slot) => land("activate", slot, () => setActive(slot)),
          }}
        />
      )}
    />
  );
}

/** The slots at work at 375 px (#804's GIF): a random village saved into slot 2, made active, then slot 1 active again. */
export const SlotsLivePhone375: Story = { ...PHONE_375, args: HOME_VILLAGE.editing, render: (args) => <SlotsLive {...args} /> };
export const SlotsLiveWide1440: Story = { ...WIDE_1440, args: HOME_VILLAGE.editing, render: (args) => <SlotsLive {...args} /> };

/** The village on the board's canvas as the board module draws it (`home-canvas.tsx`), on Storybook's assets. */
function StoryVillageCanvas({
  view,
  board,
  onReady,
  onScene,
}: {
  view: LayoutBoardView;
  board: ReturnType<typeof useBoardSettings>;
  onReady?: () => void;
  onScene?: (scene: GameScene | null) => void;
}) {
  return <BoardViewport {...useLayoutCanvas(view, { onScene, onReady })} basePath={APP_ASSETS} settings={useFramedSettings(board.renderer, view.frame)} />;
}

/**
 * The scene as the page wires it: the board's renderer under the overlays, with its settings (`useBoardSettings`).
 * `held`: the canvas's ready signal never reaches the stage (the fog stays).
 */
function InScene({ held, ...args }: HomeVillageSceneProps & { held?: boolean }) {
  const board = useBoardSettings();
  return (
    <HomeVillageScene
      {...args}
      renderCanvas={(view, onDrawn) => <StoryVillageCanvas view={view} board={board} onReady={held ? undefined : onDrawn} />}
    />
  );
}

/**
 * The village in the game scene (the fog, the weather, the day and night), in view, shielded: every capsule of the HUD; the
 * player's saved avatar living in the badge.
 */
export const Scene: Story = {
  args: { ...HOME_VILLAGE.view, shieldEndsAt: HOME_VILLAGE.shielded.shieldEndsAt },
  parameters: { look: SAVED_LOOK },
  render: (args) => <InScene {...args} />,
};
/** The same scene in edit mode: the overlays switched to the editor's, the scene's box what the panel leaves. */
export const SceneEditing: Story = { args: HOME_VILLAGE.holding, render: (args) => <InScene {...args} /> };
/** A road placed on the scene (#756): its actions out of its sides (TILE-ACTIONS), following pans, zooms and the compass, clear of the bar and the panel. */
export const ScenePlaced: Story = { args: HOME_VILLAGE.placing, render: (args) => <InScene {...args} /> };
/** A lifted tile moved on the scene: its actions round it, with Cancel. */
export const SceneMoved: Story = { args: HOME_VILLAGE.moved, render: (args) => <InScene {...args} /> };

/** The points on the scene in edit mode (#758): a line lit lights its structure's areas and dims the rest. */
export const SceneEditingPoints: Story = { args: HOME_VILLAGE.editingPoints, render: (args) => <InScene {...args} /> };
export const SceneEditingPointsLifted: Story = { args: HOME_VILLAGE.editingPointsLifted, render: (args) => <InScene {...args} /> };
/** A Wonder's line lit on the scene (#792): the wonder's tile alone lit, the rest of the board dimmed as for any line. */
export const SceneEditingPointsWonder: Story = { args: HOME_VILLAGE.editingPointsWonder, render: (args) => <InScene {...args} /> };

/** A cold arrival (#761), the village and its assets still loading: the overlays in view and usable over a thick fog. */
export const Fogged: Story = { args: { ...HOME_VILLAGE.view, arrival: "fog" }, render: (args) => <InScene {...args} held /> };
/** A cold arrival as it plays: the fog thins out (600 ms) once the canvas says the village and its assets are drawn. */
export const Clearing: Story = { args: { ...HOME_VILLAGE.view, arrival: "fog" }, render: (args) => <InScene {...args} /> };
/** A later arrival (Back from a page), the scene loaded warm: a short fade from the sky to the drawn village. */
export const Ready: Story = { args: { ...HOME_VILLAGE.view, arrival: "fade" }, render: (args) => <InScene {...args} /> };

/** View and edit at 375, 768 and 1440 px: the overlays' positions as tuned for #753. */
export const ScenePhone: Story = { ...Scene, ...PHONE_375 };
export const SceneTablet: Story = { ...Scene, ...TABLET_768 };
export const SceneWide: Story = { ...Scene, ...WIDE_1440 };
export const SceneEditingPhone: Story = { ...SceneEditing, ...PHONE_375 };
export const SceneEditingTablet: Story = { ...SceneEditing, ...TABLET_768 };
export const SceneEditingWide: Story = { ...SceneEditing, ...WIDE_1440 };
export const ScenePlacedPhone: Story = { ...ScenePlaced, ...PHONE_375 };
export const ScenePlacedWide: Story = { ...ScenePlaced, ...WIDE_1440 };
export const SceneMovedPhone: Story = { ...SceneMoved, ...PHONE_375 };
export const SceneMovedWide: Story = { ...SceneMoved, ...WIDE_1440 };

/*
 * EDIT-VILLAGE (after the Paved UX Book's "Edit my village", 2026-11-05): the editor's bar (Back, "Edit", the die, Erase held, Save
 * and Use on the book's gold pill; from `tablet` the side menu's band, as the HUD drawers', their close at its end), the tile's
 * actions out of its sides (TILE-ACTIONS), the points at the top left, and the inventory with the layouts above it (a phone's bottom sheet, a side
 * menu from `tablet`), at 320, 375, 768, 1024 and 1440 px.
 */
/** A lifted tile moved, at 320 px: the bar with "Edit", the tile's actions with Cancel, the inventory's sheet. */
export const EditScenePhone320: Story = { ...SceneMoved, ...PHONE_320 };
/** At 768 px: the bar as the side menu's band ("Edit", the menu half the screen), the inventory as a grid, the village framed beside it. */
export const EditSceneTablet768: Story = { ...SceneMoved, ...TABLET_768 };
/** From `desktop` (1024 px): the bar as the side menu's band (the HUD drawers' band, width, body and close), the inventory under it. */
export const EditSceneDesktop1024: Story = { ...SceneMoved, globals: { viewport: { value: "desktop", isRotated: false } } };
/**
 * The layouts' carousel above the inventory: Layout 1 shown and active ("Active" in the bar in Use's place), Next on to locked
 * layout 2 (its Purchase: the padlock, the Cobbles, 100); at 1440 px in the side menu.
 */
export const EditLayoutsPhone375: Story = { ...PHONE_375, ...slots(HOME_VILLAGE.slotsOne) };
export const EditLayoutsPhone320: Story = { ...PHONE_320, ...slots(HOME_VILLAGE.slotsOne) };
export const EditLayoutsWide1440: Story = { ...WIDE_1440, ...slots(HOME_VILLAGE.slotsOne) };
/** Three layouts saved: a tap loads one into the editor and saves into it; Use makes another the village. */
export const EditLayoutsThreePhone320: Story = { ...PHONE_320, ...slots(HOME_VILLAGE.slotsThree) };
/** The points at the top left under the bar, every structure's line shown, one lit. */
export const EditScorePhone375: Story = { ...PHONE_375, args: HOME_VILLAGE.editingPoints };
export const EditScorePhone320: Story = { ...PHONE_320, args: HOME_VILLAGE.editingPoints };
export const EditScoreWide1440: Story = { ...WIDE_1440, args: HOME_VILLAGE.editingPoints };
export const SceneEditingPointsWonderPhone: Story = { ...SceneEditingPointsWonder, ...PHONE_375 };
export const SceneEditingPointsWonderWide: Story = { ...SceneEditingPointsWonder, ...WIDE_1440 };
export const SceneEditingPointsPhone: Story = { ...SceneEditingPoints, ...PHONE_375 };
export const SceneEditingPointsWide: Story = { ...SceneEditingPoints, ...WIDE_1440 };
export const SceneEditingPointsLiftedPhone: Story = { ...SceneEditingPointsLifted, ...PHONE_375 };
export const SceneEditingPointsLiftedWide: Story = { ...SceneEditingPointsLifted, ...WIDE_1440 };

const degrees = (d: number) => (d * Math.PI) / 180;

/**
 * The scene in the Camera mode (#875): the camera turned to `tilt` degrees from straight down and `turn` degrees round once the
 * village and its images are drawn (the board framed first); unset, the play view's angles, from which the mode starts.
 */
function InCamera({ tilt, turn = 0, ...args }: HomeVillageSceneProps & { tilt?: number; turn?: number }) {
  const board = useBoardSettings();
  const onScene = (scene: GameScene | null) => {
    if (!scene || tilt === undefined) return;
    void scene.tileImagesReady().then(
      () => requestAnimationFrame(() => scene.setCameraAngles(degrees(tilt), degrees(turn))),
      () => undefined,
    );
  };
  return (
    <HomeVillageScene
      {...args}
      initialCamera
      renderCanvas={(view, onDrawn) => <StoryVillageCanvas view={view} board={board} onReady={onDrawn} onScene={onScene} />}
    />
  );
}

/**
 * CAMERA-MODE (#875, the owner's decisions of 2026-10-28): the Camera button beside Edit frees the village's camera, the tilt
 * from 15 to 85 degrees and the turn all the way round, each drag gliding out (the right drag or one finger turns and tilts, two
 * fingers twist). The overlays fade to the profile, the balances and Exit camera, in Edit's corner over a hint of the controls (open
 * point 2). Entered, the camera is where the play view had it (27 degrees); then at the bounds, halfway and turned round. At 375
 * and 1440 px.
 */
export const CameraPhone: Story = { args: HOME_VILLAGE.view, render: (args) => <InCamera {...args} />, ...PHONE_375 };
export const CameraWide: Story = { args: HOME_VILLAGE.view, render: (args) => <InCamera {...args} />, ...WIDE_1440 };
/** The steepest tilt, 15 degrees from straight down. */
export const CameraTilt15Phone: Story = { args: HOME_VILLAGE.view, render: (args) => <InCamera {...args} tilt={15} />, ...PHONE_375 };
export const CameraTilt15Wide: Story = { args: HOME_VILLAGE.view, render: (args) => <InCamera {...args} tilt={15} />, ...WIDE_1440 };
export const CameraTilt45Phone: Story = { args: HOME_VILLAGE.view, render: (args) => <InCamera {...args} tilt={45} />, ...PHONE_375 };
export const CameraTilt45Wide: Story = { args: HOME_VILLAGE.view, render: (args) => <InCamera {...args} tilt={45} />, ...WIDE_1440 };
/**
 * The lowest, 85 degrees, the camera almost along the ground: the closest zoom grows with the tilt, so no tile crosses the near
 * plane; the void, the fog and the sky beyond the village.
 */
export const CameraTilt85Phone: Story = { args: HOME_VILLAGE.view, render: (args) => <InCamera {...args} tilt={85} />, ...PHONE_375 };
export const CameraTilt85Wide: Story = { args: HOME_VILLAGE.view, render: (args) => <InCamera {...args} tilt={85} />, ...WIDE_1440 };
/** The village turned 180 degrees, seen from the other side, at 45 degrees. */
export const CameraTurned180Phone: Story = { args: HOME_VILLAGE.view, render: (args) => <InCamera {...args} tilt={45} turn={180} />, ...PHONE_375 };
export const CameraTurned180Wide: Story = { args: HOME_VILLAGE.view, render: (args) => <InCamera {...args} tilt={45} turn={180} />, ...WIDE_1440 };
/** The narrowest phone: Exit and its hint at the corner, alone on the screen (CAMERA-EXPLORE). */
export const CameraPhone320: Story = { args: HOME_VILLAGE.view, render: (args) => <InCamera {...args} tilt={60} turn={90} />, ...PHONE_320 };

/**
 * Entering and leaving (the GIF of #875 plays this one): Explore sends the overlays off the screen by their nearest edges, in three
 * waves (the dock and the edges, the capsules, then the profile and the balances; CAMERA-EXPLORE), Exit going down to the corner, and
 * frees the camera; turn and tilt the village, then Exit (or Escape) eases it back to the play view (27 degrees, the default turn) over
 * 600 ms and the overlays come back in the reverse order. Under reduced motion both are cuts.
 */
const enterAndLeave: Story["play"] = async ({ canvasElement }) => {
  const scene = within(canvasElement);
  const camera = await scene.findByRole("button", { name: "Explore" }, { timeout: 15_000 });
  await userEvent.click(camera);
  const exit = await scene.findByRole("button", { name: "Exit camera" });
  // The overlays off the screen and out of reach once gone: the edges' buttons (HOME-EDGES: the four tiles, the Chat tab, the
  // mission), the profile, the league's and the village's capsules; Exit alone stays.
  const overlayButtons = () =>
    scene
      .queryAllByRole("button", { name: /^(Missions|Vault|Friends|Tiles|Chat|Public Works|Profile|League|Edit village)/ })
      .filter((b) => b.checkVisibility({ visibilityProperty: true }));
  await waitFor(() => expect(overlayButtons()).toHaveLength(0));
  await expect(exit).toBeVisible();
  await userEvent.click(exit);
  await waitFor(() => expect(overlayButtons()).toHaveLength(9));
  await expect(scene.getByRole("button", { name: "Explore" })).toHaveFocus();
};
export const CameraEnterLeavePhone: Story = {
  args: HOME_VILLAGE.view,
  render: (args) => <InScene {...args} />,
  play: enterAndLeave,
  ...PHONE_375,
  parameters: { ...PHONE_375.parameters, reducedMotion: "never" },
};
export const CameraEnterLeaveWide: Story = {
  args: HOME_VILLAGE.view,
  render: (args) => <InScene {...args} />,
  play: enterAndLeave,
  ...WIDE_1440,
  parameters: { reducedMotion: "never" },
};
export const CameraEnterLeaveReducedMotion: Story = {
  args: HOME_VILLAGE.view,
  render: (args) => <InScene {...args} />,
  play: enterAndLeave,
  ...PHONE_375,
  parameters: { ...PHONE_375.parameters, reducedMotion: "always" },
};

/**
 * PHONE-NAV (#763): the app's bar on the home below `desktop` (Shop, Chests with the chests waiting, Play, League, Settings; no
 * item current), the right column's tiles, no gear and no large Play; the Chat tab and the mission above the bar. At
 * 320, 375 and 768 px; edit mode has no bar (`SceneEditingPhone`); from 1440 px none of it (`SceneWide`).
 */
export const BarPhone320: Story = { ...Scene, ...PHONE_320 };
export const BarPhone375: Story = { ...Scene, ...PHONE_375 };
export const BarTablet768: Story = { ...Scene, ...TABLET_768 };

/** The fakes played: Edit opens edit mode, Save keeps the layout (its engine score, after a short wait) and goes back to the view. */
function Playground({ scene = false, ...props }: HomeVillageSceneProps & { scene?: boolean }) {
  const board = useBoardSettings();
  const [editing, setEditing] = useState(false);
  const [village, setVillage] = useState<VillageLayout>(props.village!);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<LayoutSaved | null>(null);
  const save = (tiles: readonly BoardTile[], score: number) => {
    props.onSave?.(tiles, score);
    setSaving(true);
    setTimeout(() => {
      setSaved({ score, previous: village.score });
      setVillage({ ...village, tiles: [...tiles], score });
      setSaving(false);
    }, 600);
  };
  return (
    <HomeVillageScene
      {...props}
      village={village}
      editing={editing}
      saving={saving}
      saved={saved}
      onEditingChange={(next) => {
        props.onEditingChange?.(next);
        setEditing(next);
      }}
      onSave={save}
      onDismissSaved={() => setSaved(null)}
      {...(scene && { renderCanvas: (view) => <StoryVillageCanvas view={view} board={board} /> })}
    />
  );
}

/** Edit, place, save or leave: the modes switch in the same scene (the GIF of #753 plays this one); a save counts the chip to its score (#802). */
export const Interactive: Story = { args: HOME_VILLAGE.view, render: (args) => <Playground {...args} /> };
/** The same on the 3D scene at 375 px: place a tile, move it, send it back, the bubble following it (the GIF of #756 plays this one). */
export const InteractiveScene: Story = { args: HOME_VILLAGE.view, render: (args) => <Playground {...args} scene />, ...PHONE_375 };

/**
 * LONGPRESS-EDIT (#799): a long press on a tile of the player's own village, in view, shows Edit village by the tile and its ring, which
 * fills as the press goes on; at its end, edit mode opens as from the Edit button. Let go early, the ring rewinds and Edit stays
 * tappable about 3 s, then fades. PRESS-BUILD: the button is one of the tile's actions (TILE-ACTIONS), the white hammer on the blue
 * disc at Confirm's place (up and to the right), a constant gap from the tile at every zoom, clear of the HUD and the dock, its ring the
 * Missions' gold rail. On the plan view it stands by the tile by the same rules; on the scene it follows it. A read-only village and a
 * visit show none.
 */
const pressPlan = async (canvasElement: HTMLElement, letGo = false) => {
  const plan = await within(canvasElement).findByRole("img", { name: /^Village layout/ });
  const tile = plan.querySelector<HTMLElement>("[data-kind=starter]")!;
  fireEvent.pointerDown(tile, { button: 0, pointerId: 1 });
  if (!letGo) return;
  await waitFor(() => expect(canvasElement.querySelector("[data-press-bubble]")).not.toBeNull());
  fireEvent.pointerUp(tile, { button: 0, pointerId: 1 });
};
/**
 * A press on the scene, at the middle of the village's frame (a tile of the framed village), as the renderer's surface takes
 * it; again until the bubble shows (the scene starting, its models loading).
 */
const pressScene = async (canvasElement: HTMLElement, letGo = false) => {
  const el = await waitFor(
    () => {
      const canvas = canvasElement.querySelector("canvas");
      if (!canvas) throw new Error("no canvas yet");
      return canvas;
    },
    { timeout: 15_000 },
  );
  const box = el.getBoundingClientRect();
  const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, pointerId: 1, button: 0, isPrimary: true, bubbles: true };
  for (let i = 0; i < 40 && !canvasElement.querySelector("[data-press-bubble]"); i++) {
    el.dispatchEvent(new PointerEvent("pointerdown", at));
    await new Promise((r) => setTimeout(r, 400));
    if (!canvasElement.querySelector("[data-press-bubble]")) el.dispatchEvent(new PointerEvent("pointercancel", at));
  }
  if (letGo) el.dispatchEvent(new PointerEvent("pointerup", at));
};
/** Let go before the hold's end: the bubble lingers (no longer holding), its Edit still there to tap. */
const expectLingering = async (canvasElement: HTMLElement) => {
  await waitFor(() => expect(canvasElement.querySelector("[data-press-bubble]")?.getAttribute("data-press-bubble")).toBe("lingering"));
  expect(within(canvasElement).getByRole("button", { name: "Edit village" })).toBeInTheDocument();
};

/** The press held on the starter: Edit village out of it, its ring filling (a 6 s hold here, so it can be looked at). */
export const PressHolding: Story = { args: { ...HOME_VILLAGE.view, holdMs: 6000 }, play: ({ canvasElement }) => pressPlan(canvasElement) };
/** Let go early: the ring rewinds, Edit stays tappable about 3 s, then fades. */
export const PressLetGo: Story = {
  args: { ...HOME_VILLAGE.view, holdMs: 6000 },
  play: async ({ canvasElement }) => {
    await pressPlan(canvasElement, true);
    await expectLingering(canvasElement);
  },
};
/** Held to its end (`HOLD_MS`): edit mode opens, as from the Edit button. */
export const PressIntoEdit: Story = { args: { ...HOME_VILLAGE.view, holdMs: 800 }, render: (args) => <Playground {...args} />, play: ({ canvasElement }) => pressPlan(canvasElement) };
/** The same on the scene at 375 px (touch) and 1440 px (mouse): Edit village out of the pressed tile, following it. */
export const ScenePressPhone: Story = { args: { ...HOME_VILLAGE.view, holdMs: 6000 }, render: (args) => <InScene {...args} />, play: ({ canvasElement }) => pressScene(canvasElement), ...PHONE_375 };
export const ScenePressWide: Story = { ...ScenePressPhone, ...WIDE_1440 };
/** Let go early on the scene: Edit lingers by the tile, then fades. */
export const ScenePressLetGoPhone: Story = {
  ...ScenePressPhone,
  play: async ({ canvasElement }) => {
    await pressScene(canvasElement, true);
    await expectLingering(canvasElement);
  },
};
/** A long press into edit mode on the scene at 375 px (the GIF of #799 plays this one). */
export const ScenePressIntoEditPhone: Story = {
  args: { ...HOME_VILLAGE.view, holdMs: 800 },
  render: (args) => <Playground {...args} scene />,
  play: ({ canvasElement }) => pressScene(canvasElement),
  ...PHONE_375,
};

/**
 * PROFILE-DRAWER: a tap on the player card opens the profile, a full page with Back on a phone and from `tablet` a side panel docked at
 * the left (the Viewport control), the dock over both.
 */
export const ProfileOpen: Story = {
  args: { ...HOME_VILLAGE.view },
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: /^Profile: / }));
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Profile" })).toBeInTheDocument());
  },
};
