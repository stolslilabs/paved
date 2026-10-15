import type { Meta, StoryObj } from "@storybook/react-vite";
import { LONG_ADDRESS } from "../../mocks/stress";
import { ShortAddress } from "./short-address";

const meta = { title: "Elements/ShortAddress", component: ShortAddress, parameters: { layout: "padded" }, args: { address: LONG_ADDRESS } } satisfies Meta<typeof ShortAddress>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A full 66-character address: cut in the middle, the whole address in the title. */
export const FullAddress: Story = {};
/** Already short (an id under 15 characters): shown whole. */
export const ShortId: Story = { args: { address: "0x0123aa" } };
/** In a narrow column it never breaks: it keeps one line. */
export const Narrow: Story = { render: (args) => <p className="w-24 text-xs">Connected <ShortAddress {...args} /></p> };
