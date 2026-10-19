import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SkinsStatusView } from "./skins-status";

const meta = {
  title: "Containers/SkinsStatus",
  component: SkinsStatusView,
  parameters: { layout: "padded" },
  args: { status: { kind: "guest" }, guestTitle: "Connect to buy tiles", guestText: "Tiles are bought with the Cobbles of your account and kept on it.", onConnect: fn(), onRetry: fn() },
} satisfies Meta<typeof SkinsStatusView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Guest: Story = {};
export const Loading: Story = { args: { status: { kind: "loading" } } };
export const ReadError: Story = { args: { status: { kind: "error", message: "The node did not answer: Failed to fetch" } } };
