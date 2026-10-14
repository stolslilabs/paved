import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatRow } from "./stat-row";

const meta = {
  title: "Elements/StatRow",
  component: StatRow,
  parameters: { layout: "padded" },
  args: { label: "Cities closed", value: 4, icon: "city" },
  decorators: [(Story) => <div className="max-w-sm rounded-xl bg-card px-4"><Story /></div>],
} satisfies Meta<typeof StatRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithHint: Story = { args: { hint: "450 pts" } };
export const Gold: Story = { args: { label: "Score", value: "1 270", icon: "star", tone: "gold" } };
export const Success: Story = { args: { label: "Burn boost", value: "+3%", icon: "arrow-trend-up", tone: "success" } };
export const Danger: Story = { args: { label: "Missed by", value: "210", icon: "triangle-exclamation", tone: "danger" } };
export const NoIcon: Story = { args: { icon: undefined } };
