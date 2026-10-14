import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { RENDERER_ASSETS } from "../../mocks/assets";
import { BOARD_38 } from "../../mocks/board";
import { HandPanel } from "./hand-panel";

const tile = { plan: BOARD_38.next.plan, orientation: BOARD_38.next.orientation };

const meta = {
  title: "Containers/HandPanel",
  component: HandPanel,
  parameters: { layout: "padded" },
  args: { tile, state: "placing", tileArt: RENDERER_ASSETS, onRotate: fn(), onConfirm: fn(), onDiscard: fn(), onSurrender: fn() },
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
} satisfies Meta<typeof HandPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A tile in hand, no slot chosen yet: Confirm waits for one. */
export const Placing: Story = {};
/** A slot chosen: Confirm shows the points the placement would score. */
export const SlotChosen: Story = { args: { slotChosen: true, preview: 30 } };
export const Pending: Story = { args: { state: "pending", slotChosen: true } };
export const Refused: Story = { args: { state: "refused", slotChosen: true, error: "Move refused by the contract: the edges do not match." } };
/** The 24 h passed: only Surrender is left. */
export const Expired: Story = { args: { state: "expired" } };
/** No tile: the game is over. */
export const Empty: Story = { args: { tile: null, state: "empty" } };

/** Without the art: the plan's nine areas (the debug and accessibility view). */
export const AreasView: Story = { args: { tileArt: undefined } };

/** Rotate turns the tile a quarter. */
export const Interactive: Story = {
  render: function Render(args) {
    const [orientation, setOrientation] = useState(1);
    return <HandPanel {...args} tile={{ plan: tile.plan, orientation }} slotChosen onRotate={() => setOrientation((o) => (o % 4) + 1)} />;
  },
};
