import type { Meta, StoryObj } from "@storybook/react-vite";
import { Notice } from "./notice";

const meta = {
  title: "Elements/Notice",
  component: Notice,
  parameters: { layout: "padded" },
  args: { tone: "info", children: "Training is saved on this device." },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof Notice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};
export const Warning: Story = { args: { tone: "warning", title: "Storage is off", children: "This game is not saved and ends if the page closes." } };
export const Danger: Story = { args: { tone: "danger", title: "Not enough USDC", children: "This stake costs 10.00 USDC; the wallet holds 3.00." } };
