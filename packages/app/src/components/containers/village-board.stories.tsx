import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PLAN, VILLAGE_CRAMPED, VILLAGE_FULL, VILLAGE_GROWING, VILLAGE_RIVAL, VILLAGE_START } from "../../mocks/village";
import { VillageBoard } from "./village-board";
import { legalCells } from "./village-rules";

/** A reward's tile being placed in `village`: its legal cells. */
const placing = (village: typeof VILLAGE_GROWING, plan: number) => ({ plan, orientation: 1, legal: legalCells(village, plan) });

/**
 * The v1 village board (#646), shared with the PvP flow (#647): the owned cells and the fog beyond. The parcels and the tiers'
 * bases left with v2 (#739); the v2 village's board is `Containers/LayoutBoard`.
 */
const meta = {
  title: "Containers/VillageBoard",
  component: VillageBoard,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className="h-dvh">{Story()}</div>],
  args: { village: VILLAGE_GROWING, tileArt: originalTileArt(SOURCE_ASSETS), onPlace: fn() },
} satisfies Meta<typeof VillageBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The player's village. */
export const Own: Story = {};
/** The start: 9 cells. */
export const Start: Story = { args: { village: VILLAGE_START } };
/** A large village: 38 cells. */
export const Full: Story = { args: { village: VILLAGE_FULL } };
/** Someone else's village (a visit, the attack's territory). */
export const ReadOnly: Story = { args: { village: VILLAGE_RIVAL } };
/** No fog. */
export const FogOff: Story = { args: { fog: "off" } };
/** A road being placed: its legal cells lit. */
export const Placing: Story = { args: { placing: placing(VILLAGE_GROWING, PLAN.road) } };
/** Dragged over a lit cell: the tile previewed there. */
export const PlaceOver: Story = {
  args: (() => {
    const p = placing(VILLAGE_GROWING, PLAN.road);
    return { placing: p, over: p.legal[0] ?? null };
  })(),
};
/** A tile that fits nowhere: no cell lit. */
export const NoFit: Story = { args: { village: VILLAGE_CRAMPED, placing: placing(VILLAGE_CRAMPED, PLAN.road) } };
