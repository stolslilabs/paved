import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { THEME_SHOP } from "../../mocks/scenes";
import { ThemeShopScene } from "./theme-shop-scene";

/**
 * A theme's shop (`/settings/theme/<theme>`): its 19 tiles as rendered, each price from the chain, owned and active, Buy
 * with Cobbles. One story per state; the viewport is the toolbar's (VP).
 */
const meta = {
  title: "Scenes/ThemeShop",
  component: ThemeShopScene,
  args: { onBuy: fn(), onBuyCobbles: fn(), onMyTiles: fn(), onBack: fn(), onNavigate: fn(), onConnect: fn(), onRetry: fn(), onDismissRefusal: fn() },
} satisfies Meta<typeof ThemeShopScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Forest: four owned, two active, the rest priced 50 to 100 Cobbles, each with its variant count. */
export const Forest: Story = { args: THEME_SHOP.forest };

/** Skins reserved to a tier of their plan (#646): Gold and Diamond reached on two plans, the others wait. */
export const TierGated: Story = { args: THEME_SHOP.tierGated };

/** No Cobbles and nothing owned: Get Cobbles. */
export const NoCobbles: Story = { args: THEME_SHOP.noCobbles };

/** 60 Cobbles: two tiles can be bought, the others say how many more Cobbles they need. */
export const CantAfford: Story = { args: THEME_SHOP.cantAfford };

/** A purchase on its way. */
export const Buying: Story = { args: THEME_SHOP.buying };

/** A purchase refused. */
export const Refused: Story = { args: THEME_SHOP.refused };

/** The whole set owned and active. */
export const AllOwned: Story = { args: THEME_SHOP.allOwned };

/** Withdrawn from sale with four owned. */
export const OwnedUnpriced: Story = { args: THEME_SHOP.ownedUnpriced };

/** Snow: coming soon, under a blur. */
export const ComingSoon: Story = { args: THEME_SHOP.comingSoon };

/** A guest: Connect. */
export const Guest: Story = { args: THEME_SHOP.guest };

/** The reads on their way. */
export const Loading: Story = { args: THEME_SHOP.loading };

/** A failed read, with Retry. */
export const ReadError: Story = { args: THEME_SHOP.error };

/** WRAP360: the largest Cobble balance. */
export const Stress: Story = { args: THEME_SHOP.stress };
