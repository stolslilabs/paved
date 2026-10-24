import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PLAN } from "../../mocks/village";
import { INVENTORY } from "../../mocks/village-v2";
import { InventoryTray } from "./inventory-tray";

/** The editor's inventory (#739): a carousel, a card per plan with its count and rarity; choosing one puts its tile in hand. */
const meta = {
  title: "Containers/InventoryTray",
  component: InventoryTray,
  args: { tray: INVENTORY, tileArt: originalTileArt(SOURCE_ASSETS), onSelect: fn() },
} satisfies Meta<typeof InventoryTray>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tray: Story = {};
/** A road in hand. */
export const Held: Story = { args: { held: PLAN.road } };
/** A plan whose tiles are all on the board: listed at 0, greyed out. */
export const AllPlaced: Story = { args: { tray: { ...INVENTORY, [PLAN.wonder]: 0 } } };
/** Every slot used: the carousel is greyed, and says so. */
export const Full: Story = { args: { full: true } };
/** Nothing off the board. */
export const Empty: Story = { args: { tray: {} } };
