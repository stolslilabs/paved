import type { Meta, StoryObj } from "@storybook/react-vite";
import { BIG_AMOUNT_18, BIG_AMOUNT_6 } from "../../mocks/stress";
import { Amount } from "./amount";

const meta = { title: "Elements/Amount", component: Amount, parameters: { layout: "padded" }, args: { value: 6_000_000n, token: "usdc" } } satisfies Meta<typeof Amount>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Usdc: Story = {};
export const Tile: Story = { args: { value: 8_420_000_000_000_000_000n, token: "paved" } };
export const VaultShares: Story = { args: { value: 1_250_400_000_000_000_000_000n, token: "vpaved" } };
export const Large: Story = { args: { value: 12_345_678_900n, token: "usdc", className: "text-2xl" } };
export const ZeroAmount: Story = { args: { value: 0n } };
/** WRAP360: the largest amounts at the sizes the scenes use; an amount keeps one line. */
export const Stress: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Amount value={BIG_AMOUNT_18} token="vpaved" className="text-3xl" />
      <Amount value={BIG_AMOUNT_18} token="paved" className="text-xl" />
      <Amount value={BIG_AMOUNT_6} token="usdc" className="text-3xl" />
    </div>
  ),
};
