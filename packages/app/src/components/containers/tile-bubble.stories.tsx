import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fireEvent, fn, within } from "storybook/test";
import { PLAY_DEFAULT_POLAR_ANGLE, TILE_SIZE, type GameScene } from "@paved/renderer";
import { APP_ASSETS } from "../../mocks/assets";
import { BOARD_38 } from "../../mocks/board";
import { placeCamera } from "../../stories/renderer/story-camera";
import { BoardViewport, toGridSlot } from "./board-viewport";
import { TileBubble, type TileBubbleProps } from "./tile-bubble";

interface TileActionsStoryProps extends TileBubbleProps {
  /** On the 3D board (the default), round the placed tile; off, still in a row, as the plan view stands them over the hand. */
  board?: boolean;
  /** The camera's distance from the tile, world units (8 the closest, 300 the farthest); unset, the board's opening frame. */
  distance?: number;
  /** The compass's turn of the board, degrees: the actions keep their places on screen. */
  compass?: number;
}

/** The recorded next move of the 38-tile board: the tile placed on its cell. */
const CELL = { x: BOARD_38.next.x, y: BOARD_38.next.y };

function TileActionsStory({ board = true, distance, compass = 0, ...props }: TileActionsStoryProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!scene) return;
    const turn = (compass * Math.PI) / 180;
    scene.setCompassRotation(turn);
    if (distance === undefined) return;
    // The camera on the tile, at the play view's tilt: the cell's place, turned with the board.
    const g = toGridSlot(CELL.x, CELL.y);
    const x = g.x * TILE_SIZE;
    const z = g.y * TILE_SIZE;
    const target = [x * Math.cos(turn) + z * Math.sin(turn), 0, -x * Math.sin(turn) + z * Math.cos(turn)] as const;
    placeCamera(scene, target, [target[0], distance * Math.cos(PLAY_DEFAULT_POLAR_ANGLE), target[2] + distance * Math.sin(PLAY_DEFAULT_POLAR_ANGLE)]);
    scene.requestRender();
  }, [scene, distance, compass]);
  if (!board)
    return (
      <div className="w-full max-w-[375px] p-4">
        <TileBubble {...props} />
      </div>
    );
  const { rotations, onRotate, onDiscard, discardCost, onReturn, cancelButton, onConfirm, canConfirm, busy, coach, holdMs } = props;
  return (
    <div className="relative h-dvh w-full">
      <BoardViewport
        tiles={BOARD_38.tiles}
        basePath={APP_ASSETS}
        onScene={setScene}
        ghost={open ? { ...CELL, plan: BOARD_38.next.plan, orientation: BOARD_38.next.orientation, placed: true, fits: canConfirm !== false } : null}
        bubble={
          open
            ? { cell: CELL, rotations, onRotate, onClose: () => setOpen(false), onDiscard, discardCost, onReturn, cancelButton, onConfirm, canConfirm, busy, coach, holdMs }
            : null
        }
      />
    </div>
  );
}

/**
 * The actions on the tile being placed (TILE-ACTIONS, after the Paved UX Book's board screen, mockup 3 of "Resume a Challenge"): one
 * painted round button out of each side of the tile, in its place on screen whatever the compass (the owner's order of 2026-11-07).
 * Up and left, Cancel (the white cross on neutral grey); down and left, Rotate (only when the cell has more than one valid rotation);
 * up and right, Confirm, held about 0.8 s, the Missions' gold rail filling round the gold check's rim; down and right, Discard, held,
 * the same rail in red round the red trash (the editor's Back to the inventory in its place). An absent action leaves its place empty. The gap to the tile is a number of screen px, the same
 * at every zoom; far out the four spread apart so their 44 px targets never meet. Every button has the white hover and pressed states.
 * `board: false`: the plan view's still row over the hand.
 */
const meta = {
  title: "Containers/TileBubble",
  component: TileActionsStory,
  parameters: { layout: "fullscreen" },
  args: { rotations: 2, onRotate: fn(), onClose: fn(), onDiscard: fn(), discardCost: 50, onConfirm: fn(), canConfirm: true, holdMs: 800 },
  argTypes: {
    holdMs: { control: { type: "range", min: 200, max: 6000, step: 50 }, description: "The holds' length, ms (800 in the game)" },
    distance: { control: { type: "range", min: 8, max: 300, step: 1 }, description: "The camera's distance from the tile; unset, the opening frame" },
    compass: { control: { type: "range", min: 0, max: 360, step: 5 }, description: "The board's turn, degrees" },
  },
} satisfies Meta<typeof TileActionsStory>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Hold the button named `name` once the actions are up (the board and the actions' chunk load first). */
const hold = (name: RegExp | string) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  fireEvent.pointerDown(await within(canvasElement).findByRole("button", { name }, { timeout: 15000 }), { button: 0 });
};

/** Every action: Cancel, Discard, Rotate and Confirm, one out of each side of the tile. */
export const OnTheBoard: Story = {};
/** One valid rotation: no Rotate, its place empty; the others where they were. */
export const OneRotation: Story = { args: { rotations: 1 } };
/** A mode with no Discard: its place empty. */
export const NoDiscard: Story = { args: { onDiscard: undefined } };
/** The move is on its way: an arc of the gold tube turns round Confirm (the spinner round the icon), Discard waits. */
export const Busy: Story = { args: { busy: true } };
/** The tile cannot be placed here (its rotation does not fit): Confirm is dimmed. */
export const Disabled: Story = { args: { canConfirm: false } };
/** Confirm held: the Missions' gold rail fills round its rim (a 6 s hold here, so it can be looked at). */
export const Holding: Story = { args: { holdMs: 6000 }, play: hold("Hold to place the tile") };
/** Discard held: the same rail in red fills round the red trash, its cost in its name (a 6 s hold here). */
export const DiscardHolding: Story = { args: { holdMs: 6000 }, play: hold(/^Hold to discard the tile/) };
/** At 0 points a discard is free: its name says so. */
export const FreeDiscard: Story = { args: { discardCost: 0 } };
/** A Story level's coach mark on the placement: Confirm is ringed. */
export const Coached: Story = { args: { coach: "place" } };
/** A Story level's coach mark on the discard: the trash is ringed. */
export const CoachedDiscard: Story = { args: { coach: "discard" } };
/** The village editor's tile from the inventory (#756): Back to the inventory in Discard's place and Rotate; no Cancel (Escape cancels), no Confirm. */
export const Editor: Story = { args: { onDiscard: undefined, onConfirm: undefined, onReturn: fn(), cancelButton: false } };
/** The village editor's lifted tile: Cancel puts it back where it was. */
export const EditorLifted: Story = { args: { onDiscard: undefined, onConfirm: undefined, onReturn: fn() } };
/** Zoomed in on the tile: the same gap in screen px, the buttons the same size. */
export const ZoomedIn: Story = { args: { distance: 30 } };
/** Zoomed out as far as the camera goes: the same gap, the tile small (about 45 px on a phone, so the buttons never need spreading). */
export const ZoomedOut: Story = { args: { distance: 300 } };
/** The board turned 45 degrees: the tile a diamond, as the book's, each action out of the middle of a side; Confirm still at the top right. */
export const CompassTurned: Story = { args: { distance: 120, compass: 45 } };
/** The board turned a quarter: the same places on screen. */
export const CompassQuarter: Story = { args: { distance: 120, compass: 90 } };
/** The plan view's still row over the hand (no WebGL): the same buttons in reading order. */
export const Row: Story = { args: { board: false } };
/** The plan view's row in the editor. */
export const RowEditor: Story = { args: { board: false, onDiscard: undefined, onConfirm: undefined, onReturn: fn() } };
