import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SOURCE_ASSETS, originalTileArt } from "../../mocks/assets";
import { SKIN_PRICES, activeOn, ownedPlans } from "../../mocks/cobbles";
import { SkinGrid } from "./skin-grid";

const meta = {
  title: "Containers/SkinGrid",
  component: SkinGrid,
  parameters: { layout: "padded" },
  args: { theme: "forest", prices: SKIN_PRICES, owned: ownedPlans(7, 8, 10, 13), active: activeOn(1, 10, 13), balance: 240, tileArt: originalTileArt(SOURCE_ASSETS), onBuy: fn(), onToggle: fn() },
} satisfies Meta<typeof SkinGrid>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Forest's 19 plans: four owned, two active, the rest priced by rarity. */
export const Default: Story = {};
/** 60 Cobbles: the rarer skins say how many more Cobbles they need. */
export const CantAfford: Story = { args: { owned: 0, active: activeOn(1), balance: 60 } };
/** A Snow skin active on two plans: Forest's owned skin of those plans says it replaces it. */
export const Replaces: Story = { args: { active: activeOn(2, 7, 8) } };
/** The plans' nine areas, without the tile art. */
export const Areas: Story = { args: { tileArt: undefined } };
