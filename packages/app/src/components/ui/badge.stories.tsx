import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";

const meta = { title: "UI/Badge", component: Badge, parameters: { layout: "padded" }, args: { children: "Ranked" } } satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(["default", "secondary", "outline", "success", "info", "warning", "destructive"] as const).map((v) => (
        <Badge key={v} variant={v}>{v}</Badge>
      ))}
    </div>
  ),
};
export const AsLink: Story = {
  render: () => (
    <Badge asChild variant="outline">
      <a href="#season">Season 3</a>
    </Badge>
  ),
};
