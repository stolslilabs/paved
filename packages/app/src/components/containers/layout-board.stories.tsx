import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PLAN } from "../../mocks/village";
import { KEY_TILE, LAYOUT_GROWING, LAYOUT_START } from "../../mocks/village-v2";
import { LayoutBoard } from "./layout-board";
import { legalSpots } from "./layout-rules";

const roads = legalSpots(LAYOUT_GROWING.tiles, PLAN.road);

/**
 * The v2 village's board (#739): a free layout, no territory. In the view the fog lifts around the tiles; while editing,
 * placing works as on the board: the tile in hand lights its legal cells, a tap sets it on one, a placed tile lifts.
 */
const meta = {
  title: "Containers/LayoutBoard",
  component: LayoutBoard,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className="h-dvh">{Story()}</div>],
  args: { tiles: LAYOUT_GROWING.tiles, tileArt: originalTileArt(SOURCE_ASSETS), onTile: fn(), onPlate: fn() },
} satisfies Meta<typeof LayoutBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The view: 21 tiles under the fog, which lifts around them. */
export const View: Story = {};
/** A new village: the starter and 8 tiles. */
export const Start: Story = { args: { tiles: LAYOUT_START.tiles } };
/** Editing: the placed tiles lift with a tap, the starter wears its lock and never moves. */
export const Editing: Story = { args: { editing: true } };
/** A road in hand: its legal cells lit, as the board's plates. */
export const Plates: Story = { args: { editing: true, plates: roads } };
/** The road set on a lit cell, ringed: the bubble's hold places it. */
export const Pending: Story = { args: { editing: true, plates: roads, pending: { ...roads[0]!, plan: PLAN.road, orientation: roads[0]!.orientations[0]! } } };
/** A tile that holds the village together, tapped: it shakes instead of lifting. */
export const Shaking: Story = { args: { editing: true, shaking: KEY_TILE.id } };
