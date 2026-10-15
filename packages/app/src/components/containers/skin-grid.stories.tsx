import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { RENDERER_ASSETS } from "../../mocks/assets";
import { SKIN_PRICES, activeOn, ownedPlans } from "../../mocks/gems";
import { SkinGrid } from "./skin-grid";

const meta = {
  title: "Containers/SkinGrid",
  component: SkinGrid,
  parameters: { layout: "padded" },
  args: { theme: "forest", prices: SKIN_PRICES, owned: ownedPlans(7, 8, 10, 13), active: activeOn(1, 10, 13), balance: 240, tileArt: RENDERER_ASSETS, onBuy: fn(), onToggle: fn() },
} satisfies Meta<typeof SkinGrid>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Forest's 19 plans: four owned, two active, the rest priced by rarity. */
export const Default: Story = {};
/** 60 gems: the rarer skins say how many more gems they need. */
export const CantAfford: Story = { args: { owned: 0, active: activeOn(1), balance: 60 } };
/** A Snow skin active on two plans: Forest's owned skin of those plans says it replaces it. */
export const Replaces: Story = { args: { active: activeOn(2, 7, 8) } };
/** The plans' nine areas, without the tile art. */
export const Areas: Story = { args: { tileArt: undefined } };
