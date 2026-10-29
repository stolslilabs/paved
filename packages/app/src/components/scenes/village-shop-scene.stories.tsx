import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { SHOP_TODAY, VILLAGE_SHOP } from "../../mocks/village-v2";
import { VillageShopScene, type VillageShopSceneProps } from "./village-shop-scene";
import { PHONE_375, WIDE_1440 } from "./viewports";
import { inPanel } from "../../stories/in-panel";

/**
 * The daily tile shop (#739, part of #732) on fakes: the day's 3 offers with their rarity and price, each bought once a day,
 * and the time left until tomorrow's. One story per state of `VILLAGE_SHOP` (`mocks/village-v2.ts`); `Interactive` buys.
 */
const meta = {
  title: "Scenes/Village v2/Shop",
  component: VillageShopScene,
  parameters: { layout: "fullscreen" },
  args: { ...VILLAGE_SHOP.today, tileArt: originalTileArt(SOURCE_ASSETS), onBack: fn(), onNavigate: fn(), onBuy: fn(), onGetCobbles: fn(), onDismissRefusal: fn() },
} satisfies Meta<typeof VillageShopScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Today's three: a common, an uncommon and a mythic plan, 20, 40 and 80 Cobbles. */
export const Today: Story = { args: VILLAGE_SHOP.today };
/** A purchase on its way: the others wait. */
export const Buying: Story = { args: VILLAGE_SHOP.buying };
/** One bought: it waits for tomorrow's shop, the two others stay. */
export const OneBought: Story = { args: VILLAGE_SHOP.oneBought };
/** All three bought today. */
export const AllBought: Story = { args: VILLAGE_SHOP.allBought };
/** Short of Cobbles: what is missing, and Get Cobbles. */
export const Short: Story = { args: VILLAGE_SHOP.short };
/** The chain refused: what happened, until dismissed. */
export const Refused: Story = { args: VILLAGE_SHOP.refused };
export const Loading: Story = { args: VILLAGE_SHOP.loading };
export const Guest: Story = { args: VILLAGE_SHOP.guest };

/** The fakes played: buy each offer once; the Cobbles go down. */
function Playground(props: VillageShopSceneProps) {
  const [offers, setOffers] = useState(SHOP_TODAY);
  const [cobbles, setCobbles] = useState(props.cobbles ?? 0);
  const [buying, setBuying] = useState<number | null>(null);
  const buy = (i: number) => {
    setBuying(i);
    setTimeout(() => {
      setCobbles((c) => c - offers[i]!.price);
      setOffers((o) => o.map((x, j) => (j === i ? { ...x, bought: true } : x)));
      setBuying(null);
    }, 600);
  };
  return <VillageShopScene {...props} offers={offers} cobbles={cobbles} buying={buying} onBuy={buy} />;
}

export const Interactive: Story = { render: (args) => <Playground {...args} /> };

/** In the phone's bar (#763): the Shop current at 375 px; from 1440 px in the home's side panel, laid out as on a phone (#762). */
export const TodayPhone: Story = { ...Today, ...PHONE_375 };
export const TodayWide: Story = { ...Today, ...WIDE_1440, decorators: [inPanel("Tile shop")] };
