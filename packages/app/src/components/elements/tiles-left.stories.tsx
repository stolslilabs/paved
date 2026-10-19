import type { Meta, StoryObj } from "@storybook/react-vite";
import { TilesLeft } from "./tiles-left";


const meta = { title: "Elements/TilesLeft", component: TilesLeft, parameters: { layout: "padded" }, args: { remaining: 12 } } satisfies Meta<typeof TilesLeft>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const LastTile: Story = { args: { remaining: 1 } };
/** WRAP360: the widest count a deck can show. */
export const Stress: Story = { args: { remaining: 999 } };
/** As the HUD gives it (#540): a button that opens the deck sheet. */
export const Button: Story = { args: { onClick: () => {} } };
