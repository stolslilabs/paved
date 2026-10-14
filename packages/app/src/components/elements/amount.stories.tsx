import type { Meta, StoryObj } from "@storybook/react-vite";
import { Amount } from "./amount";

const meta = { title: "Elements/Amount", component: Amount, parameters: { layout: "padded" }, args: { value: 6_000_000n, token: "usdc" } } satisfies Meta<typeof Amount>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Usdc: Story = {};
export const Tile: Story = { args: { value: 8_420_000_000_000_000_000n, token: "paved" } };
export const Large: Story = { args: { value: 12_345_678_900n, token: "usdc", className: "text-2xl" } };
export const ZeroAmount: Story = { args: { value: 0n } };
