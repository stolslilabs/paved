import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PLAN } from "../../mocks/village";
import { INVENTORY, INVENTORY_LONG } from "../../mocks/village-v2";
import { PHONE_375, TABLET_768, WIDE_1440 } from "../scenes/viewports";
import { InventoryTray } from "./inventory-tray";

/**
 * The editor's inventory (#739): a card per plan with its count and rarity; choosing one puts its tile in hand. A carousel below
 * `desktop`, a wrapping grid that scrolls from it (#757); the Viewport control switches them. A card that cannot be chosen is
 * `aria-disabled`, so the carousel still drags from it.
 */
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

/** At 375 px, every slot used with a long inventory: every visible card waits, and the carousel still drags and swipes (#757). */
export const FullPhone: Story = { ...PHONE_375, args: { tray: INVENTORY_LONG, full: true } };
/** At 768 px, the carousel too (the panel is at the bottom below `desktop`): it drags with the mouse though every card waits. */
export const FullTablet: Story = { ...TABLET_768, args: { tray: INVENTORY_LONG, full: true } };
/** At 1440 px in a short 24 rem column, as in the editor's panel: the grid wraps and scrolls (#757). */
export const GridWide: Story = {
  ...WIDE_1440,
  args: { tray: INVENTORY_LONG },
  decorators: [
    (Story) => (
      <div className="flex h-[26rem] w-full max-w-96 flex-col gap-3 border border-border bg-card p-4">
        <Story />
      </div>
    ),
  ],
};
/** The same, every slot used: greyed in the grid as in the carousel. */
export const GridFullWide: Story = { ...GridWide, args: { tray: INVENTORY_LONG, full: true } };
