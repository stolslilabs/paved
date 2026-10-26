import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { BoardTile } from "@paved/chain";
import { expect, fireEvent, fn, waitFor, within } from "storybook/test";
import { useBoardSettings } from "../../data/board-settings";
import { APP_ASSETS, originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PLAYER_STATUS } from "../../mocks/scenes";
import { PROGRESS } from "../../mocks/players";
import { HOME_VILLAGE, INVENTORY_LONG, LAYOUT_FULL } from "../../mocks/village-v2";
import { BalancesProvider } from "../containers/balances-context";
import type { LayoutSaved } from "../containers/layout-editor";
import type { VillageLayout } from "../containers/layout-rules";
import { ProfileProvider } from "../containers/profile-context";
import { BoardViewport } from "../containers/board-viewport";
import type { LayoutBoardView } from "../containers/layout-board";
import { useLayoutCanvas } from "../containers/village-layout-canvas";
import { HomeVillageScene, type HomeVillageSceneProps } from "./home-village-scene";
import { PHONE_320, PHONE_375, TABLET_768, WIDE_1440 } from "./viewports";

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

/** The village in view: the avatar, the balances and the gear, the right column (2 chests, 3 missions), Edit and Play. */
export const View: Story = { args: HOME_VILLAGE.view };
/** A Challenge game running: the Resume chip under the top row. */
export const Resume: Story = { args: HOME_VILLAGE.resume };
/** `spawn_paused`: its notice beside the Resume chip. */
export const Paused: Story = { args: HOME_VILLAGE.paused };
/** A new player: the starter village, level 1, the league badge Unranked with 0 crowns (#755). */
export const Start: Story = { args: HOME_VILLAGE.start };
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
/** The score chip tapped (#758): the points by structure, a line lit (on the plan view, its tiles ringed, the rest dimmed). */
export const Points: Story = { args: HOME_VILLAGE.points };
/** A Wonder's line lit (#792): the wonder's tile alone, not the 8 around it, which the line still counts. */
export const PointsWonder: Story = { args: HOME_VILLAGE.pointsWonder };
/** Edit mode: the editor's bar (Back, the score, the slots, Reset all), the inventory and Save. */
export const Editing: Story = { args: HOME_VILLAGE.editing };
/** Edit mode's points unfolded above the inventory (#758), a line lit. */
export const EditingPoints: Story = { args: HOME_VILLAGE.editingPoints };
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

/** The village on the board's canvas as the board module draws it (`home-canvas.tsx`), on Storybook's assets. */
function StoryVillageCanvas({ view, board, onReady }: { view: LayoutBoardView; board: ReturnType<typeof useBoardSettings>; onReady?: () => void }) {
  return <BoardViewport {...useLayoutCanvas(view, { onScene: board.onScene, onReady })} basePath={APP_ASSETS} settings={board.renderer} />;
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

/** The points on the scene (#758): a line lit lights its structure's areas and dims the rest, in view and in edit mode. */
export const ScenePoints: Story = { args: HOME_VILLAGE.points, render: (args) => <InScene {...args} /> };
export const SceneEditingPoints: Story = { args: HOME_VILLAGE.editingPoints, render: (args) => <InScene {...args} /> };
export const SceneEditingPointsLifted: Story = { args: HOME_VILLAGE.editingPointsLifted, render: (args) => <InScene {...args} /> };

/** A Wonder's line lit on the scene (#792): the wonder's tile alone lit, the rest of the board dimmed as for any line. */
export const ScenePointsWonder: Story = { args: HOME_VILLAGE.pointsWonder, render: (args) => <InScene {...args} /> };

/**
 * A press on the scene outside the open points, away from the overlays (its middle, a little high: clear of the bottom panel
 * on a phone): a tap (`by` 0), or a drag of `by` px across, as a finger panning the village.
 */
async function pressOutsidePoints(canvasElement: HTMLElement, by: number) {
  await within(canvasElement).findByRole("region", { name: "Village points" }, { timeout: 10_000 });
  // The panel's listeners attach after its first paint: a press as it appears would beat them, as no finger can.
  await new Promise((done) => setTimeout(done, 500));
  const box = canvasElement.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height * 0.35;
  const target = document.elementFromPoint(x, y) ?? canvasElement;
  const at = (dx: number) => ({ pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, clientX: x + dx, clientY: y });
  fireEvent.pointerDown(target, at(0));
  for (let step = 1; step <= 4; step++) fireEvent.pointerMove(target, at((by * step) / 4));
  fireEvent.pointerUp(target, at(by));
}
/** A tap on the scene outside the open points (#792): the panel closes, the light off. At 375 and 1440 px. */
export const ScenePointsTapOutside: Story = { ...ScenePoints, play: ({ canvasElement }) => pressOutsidePoints(canvasElement, 0) };
/** A drag on the scene outside the open points (#792), a pan: the panel stays open, the structure still lit. At 375 and 1440 px. */
export const ScenePointsDragOutside: Story = { ...ScenePoints, play: ({ canvasElement }) => pressOutsidePoints(canvasElement, 80) };

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
export const ScenePointsPhone: Story = { ...ScenePoints, ...PHONE_375 };
export const ScenePointsWide: Story = { ...ScenePoints, ...WIDE_1440 };
export const ScenePointsWonderPhone: Story = { ...ScenePointsWonder, ...PHONE_375 };
export const ScenePointsWonderWide: Story = { ...ScenePointsWonder, ...WIDE_1440 };
export const ScenePointsTapOutsidePhone: Story = { ...ScenePointsTapOutside, ...PHONE_375 };
export const ScenePointsTapOutsideWide: Story = { ...ScenePointsTapOutside, ...WIDE_1440 };
export const ScenePointsDragOutsidePhone: Story = { ...ScenePointsDragOutside, ...PHONE_375 };
export const ScenePointsDragOutsideWide: Story = { ...ScenePointsDragOutside, ...WIDE_1440 };
export const SceneEditingPointsPhone: Story = { ...SceneEditingPoints, ...PHONE_375 };
export const SceneEditingPointsWide: Story = { ...SceneEditingPoints, ...WIDE_1440 };
export const SceneEditingPointsLiftedPhone: Story = { ...SceneEditingPointsLifted, ...PHONE_375 };
export const SceneEditingPointsLiftedWide: Story = { ...SceneEditingPointsLifted, ...WIDE_1440 };

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
