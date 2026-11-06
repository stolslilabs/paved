import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SHOP } from "../../mocks/shop";
import { withCobbles } from "../../stories/with-cobbles";
import { ShopScene } from "./shop-scene";
import { PHONE_320, PHONE_375, WIDE_1440 } from "./viewports";

/**
 * The Shop (`/village/shop`, SHOP-PAGE, the Paved UX Book's Shop): Tiles, Cobbles and Themes as tabs of one shop, one card style; the
 * HUD's drawer (a full page with Back on a phone, a side panel at the right from `tablet`). One story per state of `SHOP`
 * (`mocks/shop.ts`); the viewport is the toolbar's, and the states the owner checks are pinned at 375, 320 and 1440 px.
 */
const meta = {
  title: "Scenes/Shop",
  component: ShopScene,
  args: { onTab: fn(), onBack: fn(), onThemeBack: fn() },
  // The Cobbles (and USDC) at the header's top right.
  decorators: [withCobbles],
} satisfies Meta<typeof ShopScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const calls = { tiles: { onBuy: fn(), onGetCobbles: fn(), onConnect: fn(), onRetry: fn(), onDismissRefusal: fn() }, packs: { onSelectPack: fn(), onBuyPack: fn(), onConnect: fn() }, themes: { onBuy: fn(), onOpenTheme: fn(), onGetCobbles: fn(), onConnect: fn() } };
const of = (data: (typeof SHOP)[keyof typeof SHOP]) => ({ ...data, tiles: { ...data.tiles, ...calls.tiles }, packs: { ...data.packs, ...calls.packs }, themes: { ...data.themes, ...calls.themes } });

/** The Tiles tab: today's three, their rarity, the tiles held, their prices; the time until tomorrow's. */
export const Tiles: Story = { args: of(SHOP.tiles) };
/** A tile on its way: the others wait. */
export const Buying: Story = { args: of(SHOP.buying) };
/** A tile bought: Bought in its price's place, held once more (the toast says it is in the inventory). */
export const Bought: Story = { args: of(SHOP.bought) };
/** Short of Cobbles: what each tile needs more, and Get Cobbles. */
export const Short: Story = { args: of(SHOP.short) };
/** The Cobbles tab: the four packs, paid in USDC. */
export const Cobbles: Story = { args: of(SHOP.cobbles) };
/** A pack picked: its price pressed, Pay confirms. */
export const Picked: Story = { args: of(SHOP.picked) };
/** The Themes tab: Forest's first tiles, then the themes to come. */
export const Themes: Story = { args: of(SHOP.themes) };
/** Forest's own view: its 19 tiles. */
export const Forest: Story = { args: of(SHOP.forest) };
/** Forest's view, no Cobbles. */
export const ForestNoCobbles: Story = { args: of(SHOP.forestNoCobbles) };
export const Guest: Story = { args: of(SHOP.guest) };
export const Loading: Story = { args: of(SHOP.loading) };

export const TilesPhone: Story = { ...Tiles, ...PHONE_375 };
export const TilesPhone320: Story = { ...Tiles, ...PHONE_320 };
export const TilesWide: Story = { ...Tiles, ...WIDE_1440 };
export const BoughtPhone: Story = { ...Bought, ...PHONE_375 };
export const CobblesPhone: Story = { ...Picked, ...PHONE_375 };
export const CobblesPhone320: Story = { ...Picked, ...PHONE_320 };
export const CobblesWide: Story = { ...Picked, ...WIDE_1440 };
export const ThemesPhone: Story = { ...Themes, ...PHONE_375 };
export const ThemesPhone320: Story = { ...Themes, ...PHONE_320 };
export const ThemesWide: Story = { ...Themes, ...WIDE_1440 };
export const ForestPhone: Story = { ...Forest, ...PHONE_375 };
export const ForestWide: Story = { ...Forest, ...WIDE_1440 };
