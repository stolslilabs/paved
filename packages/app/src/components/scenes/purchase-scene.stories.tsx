import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PURCHASE } from "../../mocks/scenes";
import { PurchaseScene } from "./purchase-scene";
import { at } from "./viewports";

/** The Challenge purchase (`/play/challenge`): stake 1 to 10, price and boost, split, 24 h validity, threshold, confirm. Each state at the four viewports. */
const meta = { title: "Scenes/Purchase", component: PurchaseScene, args: { onStakeChange: fn(), onConfirm: fn(), onBack: fn() } } satisfies Meta<typeof PurchaseScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const stake1: Story = { args: PURCHASE.stake1 };
export const StakeOneMobile: Story = at("mobile", stake1);
export const StakeOneTablet: Story = at("tablet", stake1);
export const StakeOneDesktop: Story = at("desktop", stake1);
export const StakeOneWide: Story = at("wide", stake1);

/** A referrer from `?ref=`: the referral share names them. */
const stake3Referred: Story = { args: PURCHASE.stake3Referred };
export const StakeThreeReferredMobile: Story = at("mobile", stake3Referred);
export const StakeThreeReferredTablet: Story = at("tablet", stake3Referred);
export const StakeThreeReferredDesktop: Story = at("desktop", stake3Referred);
export const StakeThreeReferredWide: Story = at("wide", stake3Referred);

/** The highest stake and boost. */
const stake10: Story = { args: PURCHASE.stake10 };
export const StakeTenMobile: Story = at("mobile", stake10);
export const StakeTenTablet: Story = at("tablet", stake10);
export const StakeTenDesktop: Story = at("desktop", stake10);
export const StakeTenWide: Story = at("wide", stake10);

const short: Story = { args: PURCHASE.short };
export const NotEnoughUsdcMobile: Story = at("mobile", short);
export const NotEnoughUsdcTablet: Story = at("tablet", short);
export const NotEnoughUsdcDesktop: Story = at("desktop", short);
export const NotEnoughUsdcWide: Story = at("wide", short);

const paused: Story = { args: PURCHASE.paused };
export const PurchasesPausedMobile: Story = at("mobile", paused);
export const PurchasesPausedTablet: Story = at("tablet", paused);
export const PurchasesPausedDesktop: Story = at("desktop", paused);
export const PurchasesPausedWide: Story = at("wide", paused);

/** The approve and spawn on their way. */
const buying: Story = { args: PURCHASE.buying };
export const BuyingMobile: Story = at("mobile", buying);
export const BuyingTablet: Story = at("tablet", buying);
export const BuyingDesktop: Story = at("desktop", buying);
export const BuyingWide: Story = at("wide", buying);
