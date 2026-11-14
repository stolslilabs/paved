import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { CONQUEST_PARTS } from "../../mocks/conquest";
import { ConquestWorld, ConquestZoneMap } from "./conquest-map";

/** One zone of the Conquest's world (the season's finale): its tiles, its explored cells and its fog, the requests, a cell picked. */
const meta = {
  title: "Containers/ConquestMap",
  component: ConquestZoneMap,
  args: { onCell: fn(), onExplore: fn(), onRequest: fn(), onGive: fn(), tileArt: originalTileArt(SOURCE_ASSETS), className: "max-w-sm" },
} satisfies Meta<typeof ConquestZoneMap>;
export default meta;
type Story = StoryObj<typeof meta>;

/** An Officer's province: the dashed cells take a request. */
export const Province: Story = { args: CONQUEST_PARTS.zone };
/** A cell beside the allegiance's tiles picked: the plans that fit, by the members who hold one. */
export const Asking: Story = { args: CONQUEST_PARTS.zoneAsking };
/** A member's: they explore and give, the requests are the Officers'. */
export const Member: Story = { args: CONQUEST_PARTS.zoneMember };
/** A write on its way: nothing is tapped. */
export const Busy: Story = { args: { ...CONQUEST_PARTS.zone, busy: "explore" } };
/** The world's checkerboard: the provinces, the free zones and their Great Wonders. */
export const World: Story = { args: CONQUEST_PARTS.zone, render: () => <ConquestWorld {...CONQUEST_PARTS.world} onZone={fn()} className="max-w-sm" /> };
