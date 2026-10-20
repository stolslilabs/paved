import type { Meta, StoryObj } from "@storybook/react-vite";
import { Crowns } from "./crowns";

const meta = { title: "Elements/Crowns", component: Crowns, parameters: { layout: "padded" }, args: { value: 1_240 } } satisfies Meta<typeof Crowns>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** A new player: no crowns yet. */
export const Zero: Story = { args: { value: 0 } };
/** An attack won: the crowns gained. */
export const Gain: Story = { args: { value: 20, signed: true } };
/** An attack lost, or a defence lost: the crowns taken. */
export const Loss: Story = { args: { value: -18, signed: true } };
export const Large: Story = { args: { value: 2_615, size: "lg" } };
