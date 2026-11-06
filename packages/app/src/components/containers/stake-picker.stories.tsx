import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { StakePicker } from "./stake-picker";
import { BIG_AMOUNT_6 } from "../../mocks/stress";

/** 2 USDC a stake, the mocks' price. */
const UNIT = 2_000_000n;

const meta = {
  title: "Containers/StakePicker",
  component: StakePicker,
  parameters: { layout: "padded" },
  args: { value: 1, unit: UNIT, onChange: fn() },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof StakePicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const StakeOne: Story = {};
export const StakeTen: Story = { args: { value: 10 } };
export const Disabled: Story = { args: { value: 3, disabled: true } };

/** The arrows lower and raise the stake a step at a time, the pile and the price (2 USDC a stake here) following. */
export const Interactive: Story = {
  render: function Render(args) {
    const [value, setValue] = useState(3);
    return <StakePicker {...args} value={value} onChange={setValue} />;
  },
};
/** WRAP360: the largest price over the rail. */
export const Stress: Story = { args: { value: 10, price: BIG_AMOUNT_6 } };
