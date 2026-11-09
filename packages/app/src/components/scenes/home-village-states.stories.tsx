import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { HOME_VILLAGE, INVENTORY_LONG, LAYOUT_FULL } from "../../mocks/village-v2";
import { HomeVillageScene, type HomeVillageSceneProps } from "./home-village-scene";
import { PHONE_320, PHONE_375, WIDE_1440 } from "./viewports";
import { HOME_STORY_META } from "./home-village-story-kit";

/** Home (`/`, #753): the states (saved, unfounded, loading, failed) and edit mode on the plan view: the editor, the die. */
const meta = {
  title: "Scenes/Home",
  ...HOME_STORY_META,
} satisfies Meta<typeof HomeVillageScene>;
export default meta;
type Story = StoryObj<typeof meta>;

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
