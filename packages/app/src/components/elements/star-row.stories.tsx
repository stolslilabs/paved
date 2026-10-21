import type { Meta, StoryObj } from "@storybook/react-vite";
import { StarRow } from "./star-row";

/** A Story level's stars (#546): 0 to 3, the earned ones in gold. */
const meta = { title: "Elements/Star row", component: StarRow, parameters: { layout: "padded" }, args: { stars: 2 } } satisfies Meta<typeof StarRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Two: Story = {};
export const None: Story = { args: { stars: 0 } };
export const Three: Story = { args: { stars: 3, size: "md" } };
