import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FOREST_VARIANTS, appRenders } from "../../mocks/assets";
import { SKIN_PRICES, activeOn, ownedPlans } from "../../mocks/cobbles";
import { SkinGrid } from "./skin-grid";

const meta = {
  title: "Containers/SkinGrid",
  component: SkinGrid,
  parameters: { layout: "padded" },
  args: { theme: "forest", prices: SKIN_PRICES, owned: ownedPlans(7, 8, 10, 13), active: activeOn(1, 10, 13), variants: FOREST_VARIANTS, balance: 240, renders: appRenders, onBuy: fn() },
} satisfies Meta<typeof SkinGrid>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Forest's 19 tiles as rendered: four owned, two active, the rest priced by rarity, each with its variant count. */
export const Default: Story = {};
/** 60 Cobbles: the rarer tiles say how many more Cobbles they need. */
export const CantAfford: Story = { args: { owned: 0, active: activeOn(1), balance: 60 } };
/** A purchase on its way: the others wait. */
export const Buying: Story = { args: { buying: 1 } };
/** No render served: the plans' chips. */
export const NoRenders: Story = { args: { renders: undefined } };
/** Skins reserved to a tier of their plan (#646): reached, Buy as usual; not reached, Buy waits with the tier named. */
export const TierGated: Story = {
  args: {
    balance: 600,
    gates: { 10: { tier: 3, name: "Diamond", reached: true }, 18: { tier: 2, name: "Gold", reached: true }, 19: { tier: 3, name: "Diamond", reached: false }, 17: { tier: 4, name: "Ruby", reached: false } },
  },
};
