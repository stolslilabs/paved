import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { StakePicker } from "./stake-picker";

const meta = {
  title: "Containers/StakePicker",
  component: StakePicker,
  parameters: { layout: "padded" },
  args: { value: 1, onChange: fn() },
  decorators: [(Story) => <div className="max-w-2xl"><Story /></div>],
} satisfies Meta<typeof StakePicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const StakeOne: Story = {};
export const StakeTen: Story = { args: { value: 10 } };
export const Disabled: Story = { args: { value: 3, disabled: true } };
export const Interactive: Story = {
  render: function Render(args) {
    const [value, setValue] = useState(3);
    return <StakePicker {...args} value={value} onChange={setValue} />;
  },
};
