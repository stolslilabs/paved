import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SkinsStatusView } from "./skins-status";

const meta = {
  title: "Containers/SkinsStatus",
  component: SkinsStatusView,
  parameters: { layout: "padded" },
  args: { status: { kind: "loading" }, onRetry: fn() },
} satisfies Meta<typeof SkinsStatusView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
export const ReadError: Story = { args: { status: { kind: "error", message: "The node did not answer: Failed to fetch" } } };
