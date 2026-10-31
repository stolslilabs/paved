import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { BoardTile } from "@paved/chain";
import type { GameScene } from "@paved/renderer";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import { useBoardSettings } from "../../data/board-settings";
import { APP_ASSETS, originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PLAYER_STATUS, PROFILE } from "../../mocks/scenes";
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
import { useLayoutCanvas } from "../containers/village-layout-canvas";
import { HomeVillageScene, type HomeVillageSceneProps } from "./home-village-scene";
import { CentreGuide, expectIconCentred } from "../../stories/centre-guide";
import { PHONE_320, PHONE_375, TABLET_768, VIEWPORT_OPTIONS, WIDE_1440 } from "./viewports";

/**
 * Home (`/`, #753): the player's village full screen with Clash of Clans' overlays, and edit mode in the same scene. One story
 * per state of `HOME_VILLAGE` (`mocks/village-v2.ts`) on the plan view; the `Scene` stories put the real renderer under the
 * overlays (the fog, the day and night, the season dial), at 375, 768 and 1440 px in view and in edit mode. The avatar and the
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
    onChests: fn(),
    onShop: fn(),
    onVault: fn(),
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
    (Story, { args }) => (
      <ProfileProvider
        value={{
          state: args.guest ? { status: "guest" } : { status: "connected", data: PLAYER_STATUS },
          progress: PROGRESS.partWay,
                onDisconnect: fn(),
          onCopy: fn(async () => {}),
        }}
      >
        <BalancesProvider value={{ state: args.guest ? { status: "disconnected" } : { status: "ready", usdc: 100_000_000n, paved: 129_110_000_000_000_000_000n, cobbles: 640 }, faucet: false }}>
          <Story />
        </BalancesProvider>
      </ProfileProvider>
    ),
  ],
} satisfies Meta<typeof HomeVillageScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The village in view: the avatar, the balances, the right column (2 chests, 3 missions), Edit, and Settings over Play. */
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
 * A short desktop window (1024 x 600): the right column centred between the balances' row and Settings over Play (#856); were it
 * taller than its band, its last buttons would wrap into a second column, to the left, never under Settings.
 */
export const ShortDesktop: Story = {
  args: HOME_VILLAGE.view,
  parameters: { viewport: { options: { ...VIEWPORT_OPTIONS, short: { name: "Laptop 1024 x 600", styles: { width: "1024px", height: "600px" }, type: "desktop" } } } },
  globals: { viewport: { value: "short", isRotated: false } },
};
/** The longest username (WRAP360) in the profile: the name under the level's line truncates beside the balances, never under them. */
const LONG_NAME = (Story: () => React.JSX.Element) => (
  <ProfileProvider value={{ state: PROFILE.stress, progress: PROGRESS.partWay, onConnect: fn(), onDisconnect: fn(), onCopy: fn(async () => {}) }}>
    <Story />
  </ProfileProvider>
);
/**
 * HOME-OVERLAYS (#856, the owner's decisions of 2026-10-28): one 12 px gap in both columns; the profile at the season dial's size
 * (96, 108 and 144 px); the right column centred between the balances and Edit (Settings and Play from `desktop`), the left one's
 * controls between the profile and the dial; from `desktop` the balances in a row, no League in the right column, and Settings
 * above Play, Edit's size. At 320, 375, 768 and 1440 px, shielded or not, and with the longest name.
 */
/** The season dial in its corner (the plan view has none of its own): the left column stands clear of it. */
const DIAL = { seasonWheel: { state: "auto", onNext: fn(), read: null } } satisfies Partial<HomeVillageSceneProps>;
/** A short laptop (1024 x 600). */
const SHORT_1024 = {
  parameters: { viewport: { options: { ...VIEWPORT_OPTIONS, short: { name: "Laptop 1024 x 600", styles: { width: "1024px", height: "600px" }, type: "desktop" } } } },
  globals: { viewport: { value: "short", isRotated: false } },
};
export const OverlaysPhone320: Story = { ...PHONE_320, args: { ...HOME_VILLAGE.view, ...DIAL } };
export const OverlaysPhone375: Story = { ...PHONE_375, args: { ...HOME_VILLAGE.view, ...DIAL } };
export const OverlaysTablet768: Story = { ...TABLET_768, args: { ...HOME_VILLAGE.view, ...DIAL } };
export const OverlaysWide1440: Story = { ...WIDE_1440, args: { ...HOME_VILLAGE.view, ...DIAL } };
export const OverlaysShieldedPhone320: Story = { ...PHONE_320, args: { ...HOME_VILLAGE.shielded, ...DIAL } };
export const OverlaysShieldedPhone375: Story = { ...PHONE_375, args: { ...HOME_VILLAGE.shielded, ...DIAL } };
export const OverlaysShieldedTablet768: Story = { ...TABLET_768, args: { ...HOME_VILLAGE.shielded, ...DIAL } };
export const OverlaysShieldedWide1440: Story = { ...WIDE_1440, args: { ...HOME_VILLAGE.shielded, ...DIAL } };
export const OverlaysLongNamePhone320: Story = { ...PHONE_320, args: { ...HOME_VILLAGE.view, ...DIAL }, decorators: [LONG_NAME] };
export const OverlaysLongNamePhone375: Story = { ...PHONE_375, args: { ...HOME_VILLAGE.view, ...DIAL }, decorators: [LONG_NAME] };
export const OverlaysLongNameTablet768: Story = { ...TABLET_768, args: { ...HOME_VILLAGE.view, ...DIAL }, decorators: [LONG_NAME] };
export const OverlaysLongNameWide1440: Story = { ...WIDE_1440, args: { ...HOME_VILLAGE.view, ...DIAL }, decorators: [LONG_NAME] };
/**
 * The tallest left column: shielded, the village score unfolded, beside the dial, on the smallest phone and a short laptop. Taller
 * than its band, it starts under the profile and scrolls within the band, never under the dial.
 */
export const OverlaysShieldedScoreOpenPhone320: Story = { ...PHONE_320, args: { ...HOME_VILLAGE.shielded, ...DIAL, initialScoreOpen: true } };
export const OverlaysShieldedScoreOpenShort1024: Story = { ...SHORT_1024, args: { ...HOME_VILLAGE.shielded, ...DIAL, initialScoreOpen: true } };
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
 * crowns on the plate, the league's crest closing it, no name), the shield's mirrored plate while shielded, then the village score.
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
 * SWORDS-CENTRE (#827, the owner's decision of 2026-10-27): the swords at the centre of Play, under a centre guide (two red lines
 * through the button's centre): the home's gold button from `desktop` (1440 px), the bar's disc below it (375 px). The play checks
 * the drawn one's icon centre is the button's to half a pixel.
 */
export const PlayCentred: Story = {
  args: HOME_VILLAGE.view,
  decorators: [(Story) => <CentreGuide label="Play"><Story /></CentreGuide>],
  play: ({ canvasElement }) => expectIconCentred(canvasElement, "Play"),
};
export const PlayCentredPhone375: Story = { ...PlayCentred, ...PHONE_375 };
export const PlayCentredWide1440: Story = { ...PlayCentred, ...WIDE_1440 };

/**
 * HOME-BUTTONS (#856): Play, Settings and Edit at the bottom right, and the season dial, take the pointer at every width. The play
 * checks that the topmost element at each drawn button's centre is the button (not the village under the overlays' pass-through),
 * then clicks it: from `desktop` the row's Settings and Play, below it the bar's.
 */
export const ButtonsReachable: Story = {
  args: { ...HOME_VILLAGE.view, ...DIAL },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: /^Season/ }, { timeout: 10_000 });
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
    await reach(canvas.getByRole("button", { name: "Edit village" }));
    await reach(canvas.getByRole("button", { name: /^Season/ }));
    const desktop = canvasElement.ownerDocument.defaultView!.matchMedia("(min-width: 64rem)").matches;
    if (desktop) {
      await expect(args.onPlay).toHaveBeenCalled();
      await expect(args.onSettings).toHaveBeenCalled();
    } else {
      await expect(args.onNavigate).toHaveBeenCalledWith("play");
      await expect(args.onNavigate).toHaveBeenCalledWith("settings");
    }
    await expect(args.onEditingChange).toHaveBeenCalledWith(true);
  },
};
export const ButtonsReachablePhone320: Story = { ...ButtonsReachable, ...PHONE_320 };
export const ButtonsReachablePhone375: Story = { ...ButtonsReachable, ...PHONE_375 };
export const ButtonsReachableWide1440: Story = { ...ButtonsReachable, ...WIDE_1440 };
/** Not founded yet: the starter alone, Found in Edit's place. */
export const Unfounded: Story = { args: HOME_VILLAGE.unfounded };
/** No wallet: a starter village to look at, Connect in the header, no Edit. */
export const Guest: Story = { args: HOME_VILLAGE.guest };
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
/**
 * V3-SCORE-ACCORDION (#831, the owner's decisions of 2026-10-27): the village score under the profile is an inline accordion,
 * never a panel over the scene. Folded, the total alone (the house, the figure, a chevron); unfolded, the four kinds' sums under
 * it (roads, cities, forests, wonders, the most points first), adding up to the total. At 320, 375 and 1440 px.
 */
export const ScoreFolded: Story = { args: HOME_VILLAGE.view };
export const ScoreOpen: Story = { args: HOME_VILLAGE.scoreOpen };
/** A kind with no structure (the starter village has no Wonder): its sum shows 0. */
export const ScoreKindZero: Story = { args: HOME_VILLAGE.scoreKindZero };
/** A village with a closed Wonder: every kind scores. */
export const ScoreWonder: Story = { args: HOME_VILLAGE.scoreWonder };
/** After a save, unfolded (#802): the total counts up to the new score, the kinds under it are the new layout's. */
export const ScoreOpenSaved: Story = { args: HOME_VILLAGE.scoreOpenSaved, parameters: { reducedMotion: "never" } };
/** A tap on the total unfolds the kinds in place, with a short height animation; another folds them. */
export const ScoreToggle: Story = {
  args: HOME_VILLAGE.view,
  parameters: { reducedMotion: "never" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const total = canvas.getByRole("button", { name: /^Village score / });
    await expect(total).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(total);
    await expect(total).toHaveAttribute("aria-expanded", "true");
    await expect(await canvas.findByRole("list", { name: "Score by kind" }, { timeout: 10_000 })).toBeVisible();
    await expect(canvas.queryByRole("region", { name: "Village points" })).toBeNull();
    await userEvent.click(total);
    await waitFor(() => expect(canvas.queryByRole("list", { name: "Score by kind" })).toBeNull());
  },
};
/** The same under reduced motion: the kinds come and go at once, no height animation. */
export const ScoreToggleReducedMotion: Story = { ...ScoreToggle, parameters: { reducedMotion: "always" } };
export const ScoreFoldedPhone320: Story = { ...PHONE_320, args: HOME_VILLAGE.view };
export const ScoreFoldedPhone375: Story = { ...PHONE_375, args: HOME_VILLAGE.view };
export const ScoreFoldedWide1440: Story = { ...WIDE_1440, args: HOME_VILLAGE.view };
export const ScoreOpenPhone320: Story = { ...PHONE_320, args: HOME_VILLAGE.scoreOpen };
export const ScoreOpenPhone375: Story = { ...PHONE_375, args: HOME_VILLAGE.scoreOpen };
export const ScoreOpenWide1440: Story = { ...WIDE_1440, args: HOME_VILLAGE.scoreOpen };
export const ScoreKindZeroPhone320: Story = { ...PHONE_320, args: HOME_VILLAGE.scoreKindZero };
export const ScoreKindZeroPhone375: Story = { ...PHONE_375, args: HOME_VILLAGE.scoreKindZero };
export const ScoreKindZeroWide1440: Story = { ...WIDE_1440, args: HOME_VILLAGE.scoreKindZero };
export const ScoreOpenSavedPhone320: Story = { ...PHONE_320, args: HOME_VILLAGE.scoreOpenSaved, parameters: { ...PHONE_320.parameters, reducedMotion: "never" } };
export const ScoreOpenSavedPhone375: Story = { ...PHONE_375, args: HOME_VILLAGE.scoreOpenSaved, parameters: { ...PHONE_375.parameters, reducedMotion: "never" } };
export const ScoreOpenSavedWide1440: Story = { ...WIDE_1440, args: HOME_VILLAGE.scoreOpenSaved, parameters: { reducedMotion: "never" } };
/** Unfolded, shielded, at 320 px beside the widest balances: the whole left column, nothing under the right column. */
export const ScoreOpenStressPhone320: Story = { ...PHONE_320, args: { ...HOME_VILLAGE.leagueStress, initialScoreOpen: true }, decorators: [WIDE_BALANCES] };
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
/** Reset all held, beside the slots: the red ring fills around the eraser (a 6 s hold here, so it can be looked at). */
export const ResetHolding: Story = {
  args: { ...HOME_VILLAGE.editing, holdMs: 6000 },
  play: async ({ canvasElement }) => {
    fireEvent.pointerDown(await within(canvasElement).findByRole("button", { name: /^Hold to reset all/ }), { button: 0 });
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
/** The die pressed: busy, spinning (not under reduced motion), the hint saying it builds. */
export const DieBusy: Story = { args: HOME_VILLAGE.dieBusy };
/** The same under reduced motion: no spin. */
export const DieBusyReducedMotion: Story = { args: HOME_VILLAGE.dieBusy, parameters: { reducedMotion: "always" } };
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
 * A home state with the saved layouts' strip (#804): the page's stage reads them itself (`routes/layout-slots.ts`); the stories hand
 * the scene's own stage the fixture's.
 */
function slots<A extends { layoutSlots: LayoutSlotsProps }>({ layoutSlots, ...args }: A) {
  return { args, render: (story: HomeVillageSceneProps) => <HomeVillageScene {...story} renderStage={(stage) => <VillageStage {...stage} layoutSlots={layoutSlots} />} /> };
}

/** The saved layouts (#804) above the inventory: one slot (the village's, Active), the next two locked with their prices. */
export const SlotsOne: Story = { ...slots(HOME_VILLAGE.slotsOne) };
export const SlotsOnePhone375: Story = { ...PHONE_375, ...slots(HOME_VILLAGE.slotsOne) };
export const SlotsOneWide1440: Story = { ...WIDE_1440, ...slots(HOME_VILLAGE.slotsOne) };
/** Three slots, the die's village in slot 2 picked: Load, Save here, Make active. */
export const SlotsThree: Story = { ...slots(HOME_VILLAGE.slotsThree) };
export const SlotsThreePhone375: Story = { ...PHONE_375, ...slots(HOME_VILLAGE.slotsThree) };
export const SlotsThreeWide1440: Story = { ...WIDE_1440, ...slots(HOME_VILLAGE.slotsThree) };
/** A locked slot picked: Buy at its price. */
export const SlotsLocked: Story = { ...slots(HOME_VILLAGE.slotsLocked) };
/** Buy asked first: the price and the Cobbles held. */
export const SlotsBuy: Story = { ...slots(HOME_VILLAGE.slotsBuy) };
/** The purchase on its way. */
export const SlotsBuying: Story = { ...slots(HOME_VILLAGE.slotsBuying) };
/** Slot 2 bought: open and empty, Save here. */
export const SlotsBought: Story = { ...slots(HOME_VILLAGE.slotsBought) };
/** Too few Cobbles for slot 3: Buy off, and why. */
export const SlotsShort: Story = { ...slots(HOME_VILLAGE.slotsShort) };
/** Load over changes kept nowhere: asked first. */
export const SlotsLoad: Story = { ...slots(HOME_VILLAGE.slotsLoad) };
/** Make active: asked first, attackers will face it. */
export const SlotsActivate: Story = { ...slots(HOME_VILLAGE.slotsActivate) };
/** Slot 2 active: the village is its layout. */
export const SlotsActivated: Story = { ...slots(HOME_VILLAGE.slotsActivated) };
/** A saved layout that no longer fits (#804 open point 4): it needs tiles first, never made active. */
export const SlotsNeedsTiles: Story = { ...slots(HOME_VILLAGE.slotsNeedsTiles) };
/** A slot write refused: what happened, above the slots. */
export const SlotsRefused: Story = { ...slots(HOME_VILLAGE.slotsRefused) };

/**
 * The slots at work, as the mock ledger answers them: buy slot 2 (the Cobbles follow), press the die, Save here, Make active (the
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
  onScene = board.onScene,
}: {
  view: LayoutBoardView;
  board: ReturnType<typeof useBoardSettings>;
  onReady?: () => void;
  onScene?: (scene: GameScene | null) => void;
}) {
  return <BoardViewport {...useLayoutCanvas(view, { onScene, onReady })} basePath={APP_ASSETS} settings={board.renderer} />;
}

/**
 * The scene as the page wires it: the board's renderer under the overlays, its settings and the season dial (`useBoardSettings`).
 * `held`: the canvas's ready signal never reaches the stage (the fog stays).
 */
function InScene({ held, ...args }: HomeVillageSceneProps & { held?: boolean }) {
  const board = useBoardSettings();
  return (
    <HomeVillageScene
      {...args}
      seasonWheel={board.wheel}
      renderCanvas={(view, onDrawn) => <StoryVillageCanvas view={view} board={board} onReady={held ? undefined : onDrawn} />}
    />
  );
}

/** The village in the game scene (the fog, the weather, the day and night, the dial), in view. */
export const Scene: Story = { args: HOME_VILLAGE.view, render: (args) => <InScene {...args} /> };
/** The same scene in edit mode: the overlays switched to the editor's, the scene's box what the panel leaves. */
export const SceneEditing: Story = { args: HOME_VILLAGE.holding, render: (args) => <InScene {...args} /> };
/** A road placed on the scene (#756): the bubble by the tile, following pans, zooms and the compass, clear of the bar and the panel. */
export const ScenePlaced: Story = { args: HOME_VILLAGE.placing, render: (args) => <InScene {...args} /> };
/** A lifted tile moved on the scene: the bubble by it, with Cancel. */
export const SceneMoved: Story = { args: HOME_VILLAGE.moved, render: (args) => <InScene {...args} /> };

/** The points on the scene in edit mode (#758): a line lit lights its structure's areas and dims the rest. */
export const SceneEditingPoints: Story = { args: HOME_VILLAGE.editingPoints, render: (args) => <InScene {...args} /> };
export const SceneEditingPointsLifted: Story = { args: HOME_VILLAGE.editingPointsLifted, render: (args) => <InScene {...args} /> };
/** A Wonder's line lit on the scene (#792): the wonder's tile alone lit, the rest of the board dimmed as for any line. */
export const SceneEditingPointsWonder: Story = { args: HOME_VILLAGE.editingPointsWonder, render: (args) => <InScene {...args} /> };
/** The village score unfolded over the scene (#831): in the overlay, nothing over the village, nothing lit on it. */
export const SceneScoreOpen: Story = { args: HOME_VILLAGE.scoreOpen, render: (args) => <InScene {...args} /> };

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
export const SceneScoreOpenPhone: Story = { ...SceneScoreOpen, ...PHONE_375 };
export const SceneScoreOpenWide: Story = { ...SceneScoreOpen, ...WIDE_1440 };
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
    board.onScene(scene);
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
      seasonWheel={board.wheel}
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
/** The narrowest phone: Exit camera and its hint at the corner, clear of the profile and the balances. */
export const CameraPhone320: Story = { args: HOME_VILLAGE.view, render: (args) => <InCamera {...args} tilt={60} turn={90} />, ...PHONE_320 };

/**
 * Entering and leaving (the GIF of #875 plays this one): Camera fades the overlays and frees the camera; turn and tilt the
 * village, then Exit camera (or Escape) eases it back to the play view (27 degrees, the default turn) over 600 ms and the overlays
 * come back. Under reduced motion the return is a cut and the overlays come back at once.
 */
const enterAndLeave: Story["play"] = async ({ canvasElement }) => {
  const scene = within(canvasElement);
  const camera = await scene.findByRole("button", { name: "Camera" }, { timeout: 15_000 });
  await userEvent.click(camera);
  const exit = await scene.findByRole("button", { name: "Exit camera" });
  // The overlays faded and out of reach: Edit out of the row, the village's column hidden once faded; the profile stays.
  await expect(scene.getByRole("button", { name: "Edit village", hidden: true })).not.toBeVisible();
  await waitFor(() => expect(scene.getByRole("navigation", { name: "Village", hidden: true })).not.toBeVisible());
  await expect(scene.getByRole("button", { name: /^Profile/ })).toBeVisible();
  await userEvent.click(exit);
  await expect(scene.getByRole("button", { name: "Edit village" })).toBeVisible();
  await waitFor(() => expect(scene.getByRole("navigation", { name: "Village" })).toBeVisible());
  await expect(scene.getByRole("button", { name: "Camera" })).toHaveFocus();
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
 * item current), the right column down to Missions and Vault, no gear and no large Play; Edit and the dial above the bar. At
 * 320, 375 and 768 px; edit mode has no bar (`SceneEditingPhone`); from 1440 px none of it (`SceneWide`).
 */
export const BarPhone320: Story = { ...Scene, ...PHONE_320 };
export const BarPhone375: Story = { ...Scene, ...PHONE_375 };
export const BarTablet768: Story = { ...Scene, ...TABLET_768 };
/** The guest's home at 375 px: the bar as for a player, no Edit. */
export const BarGuestPhone: Story = { args: HOME_VILLAGE.guest, render: (args) => <InScene {...args} />, ...PHONE_375 };

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
      {...(scene && { seasonWheel: board.wheel, renderCanvas: (view) => <StoryVillageCanvas view={view} board={board} /> })}
    />
  );
}

/** Edit, place, save or leave: the modes switch in the same scene (the GIF of #753 plays this one); a save counts the chip to its score (#802). */
export const Interactive: Story = { args: HOME_VILLAGE.view, render: (args) => <Playground {...args} /> };
/** The same on the 3D scene at 375 px: place a tile, move it, send it back, the bubble following it (the GIF of #756 plays this one). */
export const InteractiveScene: Story = { args: HOME_VILLAGE.view, render: (args) => <Playground {...args} scene />, ...PHONE_375 };

/**
 * LONGPRESS-EDIT (#799): a long press on a tile of the player's own village, in view, shows a bubble by the tile with Edit (the
 * hammer, as the home's Edit since #807) and its ring, which fills as the press goes on; at its end, edit mode opens as from the
 * Edit button. Let go early, the ring rewinds and Edit stays tappable about 3 s, then fades. On the plan view the bubble stands
 * by the tile; on the scene it follows it. A guest's, a read-only village and a visit show none (`Guest`).
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

/** The press held on the starter: Edit by it, its ring filling (a 6 s hold here, so it can be looked at). */
export const PressHolding: Story = { args: { ...HOME_VILLAGE.view, holdMs: 6000 }, play: ({ canvasElement }) => pressPlan(canvasElement) };
/** Let go early: the ring rewinds, Edit stays tappable about 3 s, then fades. */
export const PressLetGo: Story = { args: { ...HOME_VILLAGE.view, holdMs: 6000 }, play: ({ canvasElement }) => pressPlan(canvasElement, true) };
/** Held to its end (`HOLD_MS`): edit mode opens, as from the Edit button. */
export const PressIntoEdit: Story = { args: { ...HOME_VILLAGE.view, holdMs: 800 }, render: (args) => <Playground {...args} />, play: ({ canvasElement }) => pressPlan(canvasElement) };
/** The same on the scene at 375 px (touch) and 1440 px (mouse): the bubble by the pressed tile, following it. */
export const ScenePressPhone: Story = { args: { ...HOME_VILLAGE.view, holdMs: 6000 }, render: (args) => <InScene {...args} />, play: ({ canvasElement }) => pressScene(canvasElement), ...PHONE_375 };
export const ScenePressWide: Story = { ...ScenePressPhone, ...WIDE_1440 };
/** Let go early on the scene: Edit lingers by the tile, then fades. */
export const ScenePressLetGoPhone: Story = { ...ScenePressPhone, play: ({ canvasElement }) => pressScene(canvasElement, true) };
/** A long press into edit mode on the scene at 375 px (the GIF of #799 plays this one). */
export const ScenePressIntoEditPhone: Story = {
  args: { ...HOME_VILLAGE.view, holdMs: 800 },
  render: (args) => <Playground {...args} scene />,
  play: ({ canvasElement }) => pressScene(canvasElement),
  ...PHONE_375,
};
