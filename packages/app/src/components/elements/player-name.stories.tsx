import type { Meta, StoryObj } from "@storybook/react-vite";
import { LONG_ADDRESS, LONG_NAME } from "../../mocks/stress";
import { PlayerName } from "./player-name";

const meta = { title: "Elements/PlayerName", component: PlayerName, parameters: { layout: "padded" }, args: { name: "stonemaster", address: "0x0123aa" } } satisfies Meta<typeof PlayerName>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Username: Story = {};
/** No Cartridge username cached: the short address. */
export const Address: Story = { args: { name: null, address: "0x05f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f" } };
/** WRAP360: the longest username and a full address, in a column narrower than either. */
export const Stress: Story = {
  args: { name: LONG_NAME, address: LONG_ADDRESS },
  render: (args) => (
    <div className="flex w-32 flex-col gap-2 text-sm">
      <PlayerName {...args} />
      <PlayerName {...args} name={null} />
    </div>
  ),
};
