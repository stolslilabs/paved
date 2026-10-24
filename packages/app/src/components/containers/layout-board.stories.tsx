import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { DRAFT_FAULTY, LAYOUT_GROWING, LAYOUT_START } from "../../mocks/village-v2";
import { LayoutBoard } from "./layout-board";
import { checkLayout } from "./layout-rules";

const faulty = checkLayout(DRAFT_FAULTY, 28);

/**
 * The v2 village's board (#739): a free layout, no territory. In the view the fog lifts around the tiles; while editing,
 * every tile and empty cell in reach is a button, the faulty edges are marked and the tiles cut off from the starter outlined.
 */
const meta = {
  title: "Containers/LayoutBoard",
  component: LayoutBoard,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className="h-dvh">{Story()}</div>],
  args: { tiles: LAYOUT_GROWING.tiles, tileArt: originalTileArt(SOURCE_ASSETS), onTile: fn(), onCell: fn(), onTilePress: fn() },
} satisfies Meta<typeof LayoutBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The view: 21 tiles under the fog, which lifts around them. */
export const View: Story = {};
/** A new village: the starter and 8 tiles. */
export const Start: Story = { args: { tiles: LAYOUT_START.tiles } };
/** Editing: the empty cells around the layout, the starter's lock. */
export const Editing: Story = { args: { editing: true } };
/** A plan held: every empty cell takes it. */
export const Targets: Story = { args: { editing: true, targets: true } };
/** A tile chosen: ringed. */
export const Selected: Story = { args: { editing: true, selected: 6, targets: true } };
/** Dragged over an empty cell: the tile previewed there. */
export const DragOver: Story = { args: { editing: true, targets: true, over: { x: 3, y: 0 }, preview: { plan: 10, orientation: 2 } } };
/** An invalid draft: the faulty edges in red, the tile cut off outlined. */
export const Faulty: Story = { args: { tiles: DRAFT_FAULTY, editing: true, faults: faulty.faults, detached: new Set(faulty.detached.map((t) => t.id)) } };
