import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { RENDERER_ASSETS, originalTileArt } from "../../mocks/assets";
import { BOARD } from "../../mocks/scenes";
import { Notice } from "../elements/notice";
import { BoardViewport } from "../containers/board-viewport";
import { TileView } from "../containers/tile-view";
import { BoardScene } from "./board-scene";

/**
 * The game board, with the real renderer on the bench's recorded boards (`packages/game-core/bench/fixtures`): the hand,
 * the score, the tiles left, the time before `expires_at`, the closing points. One story per state; the Viewport control
 * reframes it.
 */
const meta = {
  title: "Scenes/Board",
  component: BoardScene,
  args: { onBack: fn(), onRotate: fn(), onConfirm: fn(), onDiscard: fn(), onSurrender: fn() },
  render: (args) => (
    <BoardScene
      {...args}
      canvas={<BoardViewport tiles={args.tiles} gameId={args.gameId} basePath={RENDERER_ASSETS} />}
      renderHandTile={(t) => <TileView {...t} basePath={RENDERER_ASSETS} tileArt={originalTileArt(RENDERER_ASSETS)} />}
    />
  ),
} satisfies Meta<typeof BoardScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A tile in hand, no slot chosen. */
export const Placing: Story = { args: BOARD.placing };

/** A slot chosen: Confirm shows the points. */
export const SlotChosen: Story = { args: BOARD.slotChosen };

/** The last move closed a city and a forest: the points appear over the board. */
export const ClosingPoints: Story = { args: BOARD.closing };

/** A move sent: the tile pulses on the board until its receipt. */
export const PendingMove: Story = { args: BOARD.pending };

export const RefusedMove: Story = { args: BOARD.refused };

/** 24 h passed: the hand asks to surrender. */
export const Expired: Story = { args: BOARD.expired };

/** 24 h passed, as the Challenge board opens it (P5): the Surrender dialog opens by itself. */
export const ExpiredPrompt: Story = { args: { ...BOARD.expired, promptSurrender: true } };

/** A Challenge game with no account connected (P5): no hand, the board read only. */
export const ReadOnly: Story = {
  args: {
    ...BOARD.placing,
    readOnly: true,
    notices: (
      <Notice title="Connect to play" className="pointer-events-auto w-full max-w-2xl">
        This game is shown read only. Connect your wallet to play it.
      </Notice>
    ),
  },
};

/** Training with `localStorage` refused: the notice. */
export const StorageDisabled: Story = { args: BOARD.storageDisabled };

/** Training with storage on, but the last move's save refused (P3): the notice. */
export const SaveDropped: Story = { args: { ...BOARD.storageDisabled, storageDisabled: false, saveDropped: true } };

/** The 72-tile recorded board. */
export const Board72: Story = { args: BOARD.large };
