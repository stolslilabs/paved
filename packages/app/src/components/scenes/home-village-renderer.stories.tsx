import type { Meta, StoryObj } from "@storybook/react-vite";
import type { GameScene } from "@paved/renderer";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useBoardSettings } from "../../data/board-settings";
import { SAVED_LOOK } from "../../mocks/avatar";
import { HOME_VILLAGE } from "../../mocks/village-v2";
import { HomeVillageScene, type HomeVillageSceneProps } from "./home-village-scene";
import { PHONE_320, PHONE_375, TABLET_768, WIDE_1440 } from "./viewports";
import { HOME_STORY_META, slots, StoryVillageCanvas, InScene } from "./home-village-story-kit";

/** Home (`/`, #753): the village on the board's renderer under the overlays, in view and in edit mode, the Camera mode (#875) and the dock. */
const meta = {
  title: "Scenes/Home",
  ...HOME_STORY_META,
} satisfies Meta<typeof HomeVillageScene>;
export default meta;
type Story = StoryObj<typeof meta>;

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
