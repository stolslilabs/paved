import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { RENDERER_ASSETS } from "../../mocks/assets";
import { BOARD } from "../../mocks/scenes";
import { BoardViewport } from "../containers/board-viewport";
import { TileView } from "../containers/tile-view";
import { BoardScene } from "./board-scene";
import { at } from "./viewports";

/**
 * The game board, with the real renderer on the bench's recorded boards (`packages/game-core/bench/fixtures`): the hand,
 * the score, the tiles left with discards, the time before `expires_at`, the closing points. Each state at the four
 * viewports.
 */
const meta = {
  title: "Scenes/Board",
  component: BoardScene,
  args: { onBack: fn(), onRotate: fn(), onConfirm: fn(), onDiscard: fn(), onSurrender: fn() },
  render: (args) => (
    <BoardScene
      {...args}
      canvas={<BoardViewport tiles={args.tiles} gameId={args.gameId} basePath={RENDERER_ASSETS} />}
      renderHandTile={(t) => <TileView {...t} basePath={RENDERER_ASSETS} />}
    />
  ),
} satisfies Meta<typeof BoardScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A tile in hand, no slot chosen. */
const placing: Story = { args: BOARD.placing };
export const PlacingMobile: Story = at("mobile", placing);
export const PlacingTablet: Story = at("tablet", placing);
export const PlacingDesktop: Story = at("desktop", placing);
export const PlacingWide: Story = at("wide", placing);

/** A slot chosen: Confirm shows the points. */
const slotChosen: Story = { args: BOARD.slotChosen };
export const SlotChosenMobile: Story = at("mobile", slotChosen);
export const SlotChosenTablet: Story = at("tablet", slotChosen);
export const SlotChosenDesktop: Story = at("desktop", slotChosen);
export const SlotChosenWide: Story = at("wide", slotChosen);

/** The last move closed a city and a forest: the points appear over the board. */
const closing: Story = { args: BOARD.closing };
export const ClosingPointsMobile: Story = at("mobile", closing);
export const ClosingPointsTablet: Story = at("tablet", closing);
export const ClosingPointsDesktop: Story = at("desktop", closing);
export const ClosingPointsWide: Story = at("wide", closing);

/** A move sent: the tile pulses on the board until its receipt. */
const pending: Story = { args: BOARD.pending };
export const PendingMoveMobile: Story = at("mobile", pending);
export const PendingMoveTablet: Story = at("tablet", pending);
export const PendingMoveDesktop: Story = at("desktop", pending);
export const PendingMoveWide: Story = at("wide", pending);

const refused: Story = { args: BOARD.refused };
export const RefusedMoveMobile: Story = at("mobile", refused);
export const RefusedMoveTablet: Story = at("tablet", refused);
export const RefusedMoveDesktop: Story = at("desktop", refused);
export const RefusedMoveWide: Story = at("wide", refused);

/** 24 h passed: the hand asks to surrender. */
const expired: Story = { args: BOARD.expired };
export const ExpiredMobile: Story = at("mobile", expired);
export const ExpiredTablet: Story = at("tablet", expired);
export const ExpiredDesktop: Story = at("desktop", expired);
export const ExpiredWide: Story = at("wide", expired);

/** Training with `localStorage` refused: the notice. */
const storageDisabled: Story = { args: BOARD.storageDisabled };
export const StorageDisabledMobile: Story = at("mobile", storageDisabled);
export const StorageDisabledTablet: Story = at("tablet", storageDisabled);
export const StorageDisabledDesktop: Story = at("desktop", storageDisabled);
export const StorageDisabledWide: Story = at("wide", storageDisabled);

/** The 72-tile recorded board. */
const large: Story = { args: BOARD.large };
export const Board72Mobile: Story = at("mobile", large);
export const Board72Tablet: Story = at("tablet", large);
export const Board72Desktop: Story = at("desktop", large);
export const Board72Wide: Story = at("wide", large);
