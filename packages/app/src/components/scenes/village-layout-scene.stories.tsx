import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { BoardTile } from "@paved/chain";
import { fireEvent, fn, within } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { VILLAGE_LAYOUT, fakeScore } from "../../mocks/village-v2";
import { isStarter, type Inventory, type VillageLayout } from "../containers/layout-rules";
import { VillageLayoutScene, type LayoutSaved, type VillageLayoutSceneProps } from "./village-layout-scene";

/**
 * The v2 village (#739, part of #732) on fakes: the free layout, the slots, the editor and its inventory. One story per state
 * of `VILLAGE_LAYOUT` (`mocks/village-v2.ts`); the Viewport control reframes it (designed at 375 first; the editor's panel beside
 * the board from `desktop`). `Interactive` keeps its own state and saves with the off-chain engine's score; its holds are short.
 */
const meta = {
  title: "Scenes/Village v2/Layout",
  component: VillageLayoutScene,
  parameters: { layout: "fullscreen" },
  args: {
    ...VILLAGE_LAYOUT.growing,
    tileArt: originalTileArt(SOURCE_ASSETS),
    onBack: fn(),
    onSave: fn(),
    onDismissSaved: fn(),
    onDismissRefusal: fn(),
    onOpenChests: fn(),
    onOpenShop: fn(),
  },
} satisfies Meta<typeof VillageLayoutScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A new village (level 1): the starter and 8 tiles that close a structure, 9 of 9 slots. */
export const Start: Story = { args: VILLAGE_LAYOUT.start };
/** Halfway: 21 of 28 slots used, under the fog that lifts around the tiles; Edit, Chests (2 waiting), Shop. */
export const Growing: Story = { args: VILLAGE_LAYOUT.growing };
/** The editor open on the saved layout: Reset all (the eraser, held) beside the slots, the inventory's carousel and Save. */
export const Editing: Story = { args: VILLAGE_LAYOUT.editing };
/** A road in hand from the inventory: its legal cells lit, as on the board. */
export const Holding: Story = { args: VILLAGE_LAYOUT.holding };
/** The road placed on a lit cell at once (no validation, #756): the bubble rotates it or sends it back to the inventory. */
export const Placing: Story = { args: VILLAGE_LAYOUT.placing };
/** A placed tile lifted, with the bubble: rotate it in place, tap another lit cell to move it, send it back, or Cancel. */
export const Lifted: Story = { args: VILLAGE_LAYOUT.lifted };
/** The lifted tile moved to another lit cell: placed there already; Cancel puts it back where it was. */
export const Moved: Story = { args: VILLAGE_LAYOUT.moved };
/** Three tiles more than the saved layout: the live score, Save enabled. */
export const Changed: Story = { args: VILLAGE_LAYOUT.changed };
/** After Reset all: the starter alone, every tile back in the inventory, until saved. */
export const Reset: Story = { args: VILLAGE_LAYOUT.reset };
/** Reset all held: the red ring fills around the eraser in its grey circle (a 6 s hold here, so it can be looked at). */
export const ResetHolding: Story = {
  args: { ...VILLAGE_LAYOUT.editing, holdMs: 6000 },
  play: async ({ canvasElement }) => {
    fireEvent.pointerDown(within(canvasElement).getByRole("button", { name: /^Hold to reset all/ }), { button: 0 });
  },
};
/** Every slot used (20 of 20): the carousel greyed until a tile is sent back. */
export const Full: Story = { args: VILLAGE_LAYOUT.full };
/** Back with unsaved changes: asked first. */
export const Leaving: Story = { args: VILLAGE_LAYOUT.leaving };
/** The save on its way. */
export const Saving: Story = { args: VILLAGE_LAYOUT.saving };
/** The save landed: the new score and what it gained. */
export const Saved: Story = { args: VILLAGE_LAYOUT.saved };
/** The chain refused the save: what happened, the draft kept. */
export const Refused: Story = { args: VILLAGE_LAYOUT.refused };
/** A new account's editor: no tile off the board yet. */
export const EmptyInventory: Story = { args: VILLAGE_LAYOUT.emptyInventory };
/** The village on its way. */
export const Loading: Story = { args: VILLAGE_LAYOUT.loading };
/** A guest: Connect to build a village. */
export const Guest: Story = { args: VILLAGE_LAYOUT.guest };
/** The village's read failed: Retry. */
export const ReadFailed: Story = { args: VILLAGE_LAYOUT.error };
/** Someone else's village: read-only, no editor. */
export const Visit: Story = { args: VILLAGE_LAYOUT.visit };

/** The fakes played: edit, save (the engine scores the layout, after a short wait), edit again. */
function Playground(props: VillageLayoutSceneProps) {
  const [village, setVillage] = useState<VillageLayout>(props.village!);
  const [inventory, setInventory] = useState<Inventory>(props.inventory ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<LayoutSaved | null>(null);
  const save = (tiles: readonly BoardTile[]) => {
    props.onSave?.(tiles);
    setSaving(true);
    setTimeout(() => {
      // The inventory takes back what left the layout and gives what joined it.
      const next: Record<number, number> = { ...inventory };
      for (const t of village.tiles) if (!isStarter(t)) next[t.plan] = (next[t.plan] ?? 0) + 1;
      for (const t of tiles) if (!isStarter(t)) next[t.plan] = (next[t.plan] ?? 0) - 1;
      const score = fakeScore(tiles);
      setSaved({ score, previous: village.score });
      setVillage({ ...village, tiles: [...tiles], score });
      setInventory(next);
      setSaving(false);
    }, 700);
  };
  return <VillageLayoutScene {...props} village={village} inventory={inventory} saving={saving} saved={saved} onSave={save} onDismissSaved={() => setSaved(null)} />;
}

/** Play it: Edit, choose a tile, tap a lit cell, tap another to move it; lift a tile to move it or send it back; Save to see the new score. */
export const Interactive: Story = { args: { ...VILLAGE_LAYOUT.growing, holdMs: 300 }, render: (args) => <Playground {...args} /> };
