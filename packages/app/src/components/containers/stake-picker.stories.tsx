import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { Amount } from "../elements/amount";
import { StakePicker } from "./stake-picker";

const meta = {
  title: "Containers/StakePicker",
  component: StakePicker,
  parameters: { layout: "padded" },
  args: { value: 1, price: <Amount value={2_000_000n} token="usdc" />, onChange: fn() },
  decorators: [(Story) => <div className="max-w-2xl"><Story /></div>],
} satisfies Meta<typeof StakePicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const StakeOne: Story = {};
export const StakeTen: Story = { args: { value: 10, price: <Amount value={20_000_000n} token="usdc" /> } };
export const Disabled: Story = { args: { value: 3, price: <Amount value={6_000_000n} token="usdc" />, disabled: true } };

/** Drag, or focus and use the arrow keys, Home and End: the stake and the price (2 USDC a stake here) follow. */
export const Interactive: Story = {
  render: function Render(args) {
    const [value, setValue] = useState(3);
    return <StakePicker {...args} value={value} price={<Amount value={BigInt(value) * 2_000_000n} token="usdc" />} onChange={setValue} />;
  },
};
