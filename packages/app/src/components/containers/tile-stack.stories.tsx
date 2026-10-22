import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fireEvent, fn, within } from "storybook/test";
import { APP_ASSETS, SOURCE_ASSETS, appRenders, originalTileArt } from "../../mocks/assets";
import { planCode } from "../elements/tile-chip";
import { BOARD_38 } from "../../mocks/board";
import { LONG_ADDRESS, LONG_SENTENCE } from "../../mocks/stress";
import { TileView } from "./tile-view";
import { TileStack } from "./tile-stack";

const tile = { plan: BOARD_38.next.plan, orientation: BOARD_38.next.orientation };

/**
 * The hand as a tile stack (#606), bottom right of the board: the tile in hand on top (only that one), the bodies of the
 * tiles left under it (up to five), the round tiles-left badge; a tap opens the deck sheet. While no cell is chosen, the
 * small bubble on its left holds Discard. The coming tiles (#645) are their top-down voxel renders (#679), as the board and
 * the deck sheet draw them. Framed here at the bottom right of a phone's board.
 */
const meta = {
  title: "Containers/TileStack",
  component: TileStack,
  parameters: { layout: "fullscreen" },
  args: { tile, state: "placing", remaining: 38, discardCost: 50, tileArt: originalTileArt(SOURCE_ASSETS), renders: appRenders, onDeck: fn(), onDiscard: fn(), onSurrender: fn() },
  decorators: [
    (Story) => (
      <div className="relative h-[420px] w-full max-w-[375px] bg-board">
        <div className="absolute right-2 bottom-2 left-2 flex flex-col items-end">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof TileStack>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The start of a game: 38 tiles left (five bodies under the top), the hint, and the stack's Discard. */
export const Left38: Story = {};
/** Five tiles left: five bodies. */
export const Left5: Story = { args: { remaining: 5 } };
/** One tile left after this one: one body. */
export const Left1: Story = { args: { remaining: 1 } };
/** The last tile: no body under it, the badge at 0. */
export const Left0: Story = { args: { remaining: 0 } };
/** The tile on a cell (the bubble's): the top dimmed, the stack's Discard gone (the bubble has it). */
export const OnACell: Story = { args: { cellChosen: true } };
/** Discard held on the stack: the red ring fills around the trash (a 6 s hold here, so it can be looked at). */
export const DiscardHolding: Story = {
  args: { holdMs: 6000 },
  play: async ({ canvasElement }) => {
    fireEvent.pointerDown(within(canvasElement).getByRole("button", { name: /^Hold to discard the tile/ }), { button: 0 });
  },
};
/** The tile fits no cell in any rotation: the stack's Discard says so. */
export const FitsNowhere: Story = { args: { fitsNowhere: true } };
/** A free discard (0 points): its title and label say so. */
export const FreeDiscard: Story = { args: { discardCost: 0, remaining: 30 } };
/** A move sent: the top pulses, "Placing…", no Discard. */
export const Pending: Story = { args: { state: "pending", cellChosen: true } };
/** The last move came back refused: the compact banner above the stack. */
export const Refused: Story = {
  args: {
    state: "refused",
    error: "The edges do not match.",
    errorDetail: { code: "WriteError", txHash: "0x05f16e7f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5", gameId: 42, version: "0.1.0", at: Date.UTC(2026, 9, 16, 9, 30) },
  },
};
/** The 24 h passed: the banner carries Surrender, the only move left. */
export const Expired: Story = { args: { state: "expired", remaining: 12 } };
/** No tile: the game is over. */
export const Empty: Story = { args: { tile: null, state: "empty", remaining: 0 } };
/** A board the viewer does not play: the tiles left and the deck only. */
export const ReadOnly: Story = { args: { tile: null, state: "empty", readOnly: true, remaining: 12 } };
/** A Story coach mark on the deck: the stack is ringed. */
export const CoachDeck: Story = { args: { coach: "deck" } };
/** A Story coach mark on the discard: the stack's trash is ringed. */
export const CoachDiscard: Story = { args: { coach: "discard", discardCost: 0 } };
/** The tile drawn by the renderer, as the board draws it (what the board scene shows). */
export const Rendered: Story = { args: { renderTile: (t) => <TileView {...t} basePath={APP_ASSETS} tileArt={originalTileArt(SOURCE_ASSETS)} /> } };
/** Without the art: the plan's nine areas. */
export const AreasView: Story = { args: { tileArt: undefined } };
/** WRAP360: a long refusal with an unbroken address wraps inside the banner; three-digit tiles left. */
export const Stress: Story = { args: { state: "refused", error: `${LONG_SENTENCE} ${LONG_ADDRESS}`, remaining: 254 } };

/** A turn: each Discard (a hold) draws the next tile, which comes up with a short rise (none under reduced motion). */
export const NextTile: Story = {
  args: { remaining: 6 },
  render: function Render(args) {
    const [left, setLeft] = useState(args.remaining);
    const plans = [3, 7, 12, 5, 9, 14, 2];
    return <TileStack {...args} remaining={left} tile={left >= 0 ? { plan: plans[left % plans.length]!, orientation: (left % 4) + 1 } : null} onDiscard={() => setLeft((n) => n - 1)} />;
  },
};

/** #645: the plans of two coming tiles. */
const COMING = [{ plan: 7 }, { plan: 12 }];
/** #645, game start: the tile to place and the two drawn with it, 37 tiles left. */
export const QueueStart: Story = { args: { remaining: 37, coming: COMING } };
/** #645, three tiles known mid-game: the next nearest the stack, the one after it beyond. */
export const QueueKnown: Story = { args: { remaining: 20, coming: COMING } };
/** #645, the last three tiles of the deck: still two coming. */
export const QueueLastThree: Story = { args: { remaining: 3, coming: COMING } };
/** #645, the last two: one coming. */
export const QueueLastTwo: Story = { args: { remaining: 2, coming: COMING.slice(0, 1) } };
/** #645, the last tile: nothing coming. */
export const QueueLastTile: Story = { args: { remaining: 1, coming: [] } };
/** #645, a Challenge move on its way: the next tile waits with it, the one after it is shown, the chain draws the last. */
export const QueueDrawing: Story = { args: { remaining: 19, state: "pending", tile: { plan: 7, orientation: 1 }, coming: COMING.slice(1), drawing: true } };
/** #645, Training: the same queue, from the local random. */
export const QueueTraining: Story = { args: { remaining: 30, coming: [{ plan: 4 }, { plan: 9 }] } };
/** #645, the queue on the bubble's tile: the stack dims, the coming tiles stay. */
export const QueueOnACell: Story = { args: { remaining: 20, coming: COMING, cellChosen: true } };
/** #645, the tile fits nowhere: the stack's Discard says so beside the coming tiles (the widest hand, 360 px). */
export const QueueFitsNowhere: Story = { args: { remaining: 20, coming: COMING, fitsNowhere: true } };
/** #679, the player's skins: each coming tile in the theme the board draws it in (Forest here), the base models elsewhere. */
export const QueueSkinned: Story = { args: { remaining: 20, coming: COMING, skins: Object.fromEntries(COMING.map((t) => [planCode(t.plan).toLowerCase(), 1])) } };
/** #679, no renders served (a build without them): the coming tiles fall back to the board's tile art, as before. */
export const QueueNoRenders: Story = { args: { remaining: 20, coming: COMING, renders: undefined } };
