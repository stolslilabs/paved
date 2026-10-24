import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { REWARD, REWARD_CRAMPED, VILLAGE_CRAMPED, VILLAGE_GROWING } from "../../mocks/village";
import { RewardSheet } from "./reward-sheet";

/** The reward's sheet (#646): three tiles, or Cobbles. The scene drags from it (`Scenes/Village`). */
const meta = {
  title: "Containers/RewardSheet",
  component: RewardSheet,
  args: { offer: REWARD, village: VILLAGE_GROWING, tileArt: originalTileArt(SOURCE_ASSETS), onSelect: fn(), onRotate: fn(), onTakeCobbles: fn(), onDragStart: fn() },
} satisfies Meta<typeof RewardSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Offer: Story = {};
/** A tile chosen and turned a quarter: Rotate shows. */
export const Chosen: Story = { args: { selected: 0, orientation: 2 } };
/** One tile fits, two are greyed out. */
export const Cramped: Story = { args: { offer: REWARD_CRAMPED, village: VILLAGE_CRAMPED } };
/** The choice on its way. */
export const Busy: Story = { args: { busy: true } };
