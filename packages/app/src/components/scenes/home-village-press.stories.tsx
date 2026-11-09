import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { BoardTile } from "@paved/chain";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { useBoardSettings } from "../../data/board-settings";
import { HOME_VILLAGE } from "../../mocks/village-v2";
import type { LayoutSaved } from "../containers/layout-editor";
import type { VillageLayout } from "../containers/layout-rules";
import { HomeVillageScene, type HomeVillageSceneProps } from "./home-village-scene";
import { PHONE_375, WIDE_1440 } from "./viewports";
import { HOME_STORY_META, StoryVillageCanvas, InScene } from "./home-village-story-kit";

/** Home (`/`, #753): the fakes played (Edit, place, save) and the long press into edit mode (LONGPRESS-EDIT). */
const meta = {
  title: "Scenes/Home",
  ...HOME_STORY_META,
} satisfies Meta<typeof HomeVillageScene>;
export default meta;
type Story = StoryObj<typeof meta>;

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
