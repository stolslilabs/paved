import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PLAN } from "../../mocks/village";
import { INVENTORY } from "../../mocks/village-v2";
import { InventoryTray } from "./inventory-tray";

/** The editor's inventory (#739): a count and a rarity per plan; drag a chip onto the board, or tap it, then a cell. */
const meta = {
  title: "Containers/InventoryTray",
  component: InventoryTray,
  args: { tray: INVENTORY, tileArt: originalTileArt(SOURCE_ASSETS), onSelect: fn(), onDragStart: fn() },
} satisfies Meta<typeof InventoryTray>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tray: Story = {};
/** A road held, turned a quarter. */
export const Held: Story = { args: { held: PLAN.road, orientation: 2 } };
/** A plan whose tiles are all on the board: listed at 0, greyed out. */
export const AllPlaced: Story = { args: { tray: { ...INVENTORY, [PLAN.wonder]: 0 } } };
/** Every slot used: nothing more can go on. */
export const Full: Story = { args: { full: true } };
/** A placed tile dragged over it: dropping takes it off. */
export const Dropping: Story = { args: { dropping: true } };
/** Nothing off the board. */
export const Empty: Story = { args: { tray: {} } };
