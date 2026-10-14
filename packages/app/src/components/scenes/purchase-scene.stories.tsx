import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PURCHASE } from "../../mocks/scenes";
import { PurchaseScene } from "./purchase-scene";

/** The Challenge purchase (`/play/challenge`): stake 1 to 10, price and boost, split, 24 h validity, threshold, confirm. One story per state; the Viewport control reframes it. */
const meta = { title: "Scenes/Purchase", component: PurchaseScene, args: { onStakeChange: fn(), onConfirm: fn(), onBack: fn() } } satisfies Meta<typeof PurchaseScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const StakeOne: Story = { args: PURCHASE.stake1 };

/** A referrer from `?ref=`: the referral share names them. */
export const StakeThreeReferred: Story = { args: PURCHASE.stake3Referred };

/** The highest stake and boost. */
export const StakeTen: Story = { args: PURCHASE.stake10 };

export const NotEnoughUsdc: Story = { args: PURCHASE.short };

export const PurchasesPaused: Story = { args: PURCHASE.paused };

/** The approve and spawn on their way. */
export const Buying: Story = { args: PURCHASE.buying };
