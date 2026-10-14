import type { Meta, StoryObj } from "@storybook/react-vite";
import { Separator } from "./separator";

const meta = { title: "UI/Separator", component: Separator, parameters: { layout: "padded" } } satisfies Meta<typeof Separator>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="max-w-sm text-sm">
      <p>Ranks</p>
      <Separator className="my-3" />
      <p>Quests</p>
    </div>
  ),
};
export const Vertical: Story = {
  render: () => (
    <div className="flex h-5 items-center gap-3 text-sm">
      <span>Home</span>
      <Separator orientation="vertical" />
      <span>Vault</span>
    </div>
  ),
};
