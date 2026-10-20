import type { Meta, StoryObj } from "@storybook/react-vite";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { TierBase } from "./tier-base";
import { TileChip } from "./tile-chip";

/** A tier's base under a tile (#646): dirt, silver, gold, diamond, ruby, whatever the skin. */
const meta = {
  title: "Elements/TierBase",
  component: TierBase,
  args: { tier: 0, rim: "wide" },
  render: (args) => (
    <span className="block size-32">
      <TierBase {...args} className="size-full">
        <TileChip plan={10} art={originalTileArt(SOURCE_ASSETS)} className="size-full rounded-[2px] border-0" />
      </TierBase>
    </span>
  ),
} satisfies Meta<typeof TierBase>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Dirt: Story = { args: { tier: 0 } };
export const Silver: Story = { args: { tier: 1 } };
export const Gold: Story = { args: { tier: 2 } };
export const Diamond: Story = { args: { tier: 3 } };
export const Ruby: Story = { args: { tier: 4 } };
/** The rim on a board cell. */
export const Thin: Story = { args: { tier: 2, rim: "thin" } };
