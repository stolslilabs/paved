import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PLAN, VILLAGE_CRAMPED, VILLAGE_FULL, VILLAGE_GROWING, VILLAGE_RIVAL, VILLAGE_START } from "../../mocks/village";
import { VillageBoard } from "./village-board";
import { copyTargets, legalCells } from "./village-rules";

/** A reward's tile being placed in `village`: its legal cells and its copy targets. */
const placing = (village: typeof VILLAGE_GROWING, plan: number) => ({ plan, orientation: 1, legal: legalCells(village, plan), copies: copyTargets(village, plan).map((t) => t.id) });

/**
 * The village board (#646), shared with the PvP flow (#647): the owned cells, the parcels around them, the fog beyond
 * (#633's village variant as a prop until #648). The PvP attack draws the defender's territory with `parcels` off.
 */
const meta = {
  title: "Containers/VillageBoard",
  component: VillageBoard,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className="h-dvh">{Story()}</div>],
  args: { village: VILLAGE_GROWING, tileArt: originalTileArt(SOURCE_ASSETS), onParcel: fn(), onPlace: fn(), onCopy: fn() },
} satisfies Meta<typeof VillageBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The player's village: the parcels are buttons. */
export const Own: Story = { args: { parcels: true } };
/** The start: 9 cells. */
export const Start: Story = { args: { village: VILLAGE_START, parcels: true } };
/** 38 cells: no parcel left. */
export const Full: Story = { args: { village: VILLAGE_FULL, parcels: true } };
/** Read-only (a visit, the attack's territory): no parcel buttons. */
export const ReadOnly: Story = { args: { village: VILLAGE_RIVAL } };
/** No fog. */
export const FogOff: Story = { args: { parcels: true, fog: "off" } };
/** A road being placed: its legal cells lit, the placed roads ringed. */
export const Placing: Story = { args: { placing: placing(VILLAGE_GROWING, PLAN.road) } };
/** Dragged over a ringed tile: the copy it adds and the tier's progress. */
export const CopyOver: Story = {
  args: (() => {
    const p = placing(VILLAGE_GROWING, PLAN.wonder);
    const tile = VILLAGE_GROWING.tiles.find((t) => t.plan === PLAN.wonder)!;
    return { placing: p, over: { x: tile.x, y: tile.y } };
  })(),
};
/** Dragged over a lit cell: the tile previewed there. */
export const PlaceOver: Story = {
  args: (() => {
    const p = placing(VILLAGE_GROWING, PLAN.road);
    return { placing: p, over: p.legal[0] ?? null };
  })(),
};
/** A tile that fits nowhere and has no copy target: no cell lit. */
export const NoFit: Story = { args: { village: VILLAGE_CRAMPED, placing: placing(VILLAGE_CRAMPED, PLAN.road) } };
