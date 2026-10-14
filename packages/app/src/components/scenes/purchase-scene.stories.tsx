import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { PURCHASE, purchaseAt } from "../../mocks/scenes";
import { PurchaseScene } from "./purchase-scene";

/** The Challenge purchase (`/play/challenge`): stake 1 to 10, price and boost, split, 24 h validity, threshold, confirm. One story per state; the Viewport control reframes it. */
/** The slider moves the stake in every story: the price, boost and split follow it (the state's own stake is where it starts). */
function Stateful({ stake, onStakeChange, ...args }: React.ComponentProps<typeof PurchaseScene>) {
  const [current, setCurrent] = useState(stake);
  useEffect(() => setCurrent(stake), [stake]);
  return (
    <PurchaseScene
      {...args}
      {...purchaseAt(current)}
      onStakeChange={(s) => {
        setCurrent(s);
        onStakeChange?.(s);
      }}
    />
  );
}

const meta = { title: "Scenes/Purchase", component: PurchaseScene, render: (args) => <Stateful {...args} />, args: { onStakeChange: fn(), onConfirm: fn(), onBack: fn() } } satisfies Meta<typeof PurchaseScene>;
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
