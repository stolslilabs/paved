import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { SOURCE_ASSETS, originalTileArt } from "../../mocks/assets";
import { BOARD_38 } from "../../mocks/board";
import { TileView } from "./tile-view";
import { HandPanel } from "./hand-panel";
import { LONG_ADDRESS, LONG_SENTENCE } from "../../mocks/stress";

const tile = { plan: BOARD_38.next.plan, orientation: BOARD_38.next.orientation };

const meta = {
  title: "Containers/HandPanel",
  component: HandPanel,
  parameters: { layout: "padded" },
  args: { tile, state: "placing", tileArt: originalTileArt(SOURCE_ASSETS), onDiscard: fn(), onSurrender: fn() },
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
} satisfies Meta<typeof HandPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A tile in hand, no slot chosen yet: the hint asks for one. There is no Place tile (#568): the bubble's hold places. */
export const Placing: Story = {};
/** A slot chosen: the hint names the hold on the bubble's check; the points ride on the HUD's score (Containers/GameHud). */
export const SlotChosen: Story = { args: { slotChosen: true } };
export const Pending: Story = { args: { state: "pending", slotChosen: true } };
export const Refused: Story = { args: { state: "refused", slotChosen: true, error: "The edges do not match.", errorDetail: { code: "WriteError", txHash: "0x05f16e7f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5", gameId: 42, version: "0.1.0", at: Date.UTC(2026, 9, 16, 9, 30) } } };
/** The 24 h passed: only Surrender is left. */
export const Expired: Story = { args: { state: "expired" } };
/** No tile: the game is over. */
export const Empty: Story = { args: { tile: null, state: "empty" } };

/** The tile drawn by the renderer, as the board draws it (what the board scene shows). */
export const Rendered: Story = { args: { renderTile: (t) => <TileView {...t} basePath={SOURCE_ASSETS} tileArt={originalTileArt(SOURCE_ASSETS)} /> } };

/** Without the art: the plan's nine areas (the debug and accessibility view). */
export const AreasView: Story = { args: { tileArt: undefined } };

/** The hand has no Rotate: the bubble on the board turns the tile (see Containers/TileBubble). Discard and Surrender share a row. */
export const Interactive: Story = {
  render: function Render(args) {
    const [orientation, setOrientation] = useState(1);
    return (
      <div className="flex flex-col gap-2">
        <button type="button" className="text-xs underline" onClick={() => setOrientation((o) => (o % 4) + 1)}>Turn the tile (what the bubble does)</button>
        <HandPanel {...args} tile={{ plan: tile.plan, orientation }} slotChosen />
      </div>
    );
  },
};
/** The mobile frame: 375 px wide, the panel across the screen: the tile left, the hint, Discard and Surrender beside it. */
export const Mobile: Story = { args: { slotChosen: true }, decorators: [(Story) => <div className="w-full max-w-[375px] p-2"><Story /></div>], parameters: { viewport: { defaultViewport: "mobile1" } } };
/** WRAP360: a long refusal with an unbroken address wraps inside the panel. */
export const Stress: Story = { args: { state: "refused", error: `${LONG_SENTENCE} ${LONG_ADDRESS}`, slotChosen: true } };
/** Story mode: no Surrender, Discard takes the row. */
export const StoryMode: Story = { args: { canSurrender: false }, decorators: [(Story) => <div className="w-full max-w-[375px] p-2"><Story /></div>] };
