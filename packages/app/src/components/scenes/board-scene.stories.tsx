import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import type { BoardTile } from "@paved/chain";
import { Direction, DirectionType, Layout, Orientation, Plan } from "@paved/game-core";
import { DAY_PHASE_AT, type RendererSettingsInput } from "@paved/renderer";
import { boardSlots, type BoardSlot, type Slot } from "../../data/placement";
import { APP_ASSETS, SOURCE_ASSETS, originalTileArt } from "../../mocks/assets";
import { BOARD_38 } from "../../mocks/board";
import { BOARD } from "../../mocks/scenes";
import { Notice } from "../elements/notice";
import { BoardViewport } from "../containers/board-viewport";
import { TileView } from "../containers/tile-view";
import { BoardScene, type BoardSceneProps } from "./board-scene";

/** The cells next to a cell (the contracts' coordinates, y north) and the side of the new tile that faces each. */
const NEIGHBORS: ReadonlyArray<readonly [number, number, DirectionType]> = [
  [0, 1, DirectionType.North],
  [1, 0, DirectionType.East],
  [0, -1, DirectionType.South],
  [-1, 0, DirectionType.West],
];

/**
 * The legal slots of `plan` at `orientation` on `tiles`: a free cell next to a tile, every touching edge matching (the
 * rule the bench's boards were built with, `Layout.isCompatible`, the engine's on these plans). A story's stand-in for
 * the session's `slots`, so the board shows the real possible and valid positions of the tile in hand.
 */
function slotsOf(tiles: BoardTile[], plan: number, orientation: number): Slot[] {
  const byPos = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
  const layout = Layout.from(Plan.from(plan), Orientation.from(orientation).value);
  const seen = new Set<string>();
  const slots: Slot[] = [];
  for (const t of tiles) {
    for (const [dx, dy] of NEIGHBORS) {
      const [x, y] = [t.x + dx, t.y + dy];
      const key = `${x},${y}`;
      if (byPos.has(key) || seen.has(key)) continue;
      seen.add(key);
      const fits = NEIGHBORS.every(([nx, ny, side]) => {
        const n = byPos.get(`${x + nx},${y + ny}`);
        return !n || layout.isCompatible(Layout.from(Plan.from(n.plan), Orientation.from(n.orientation).value), new Direction(side));
      });
      if (fits) slots.push({ x, y });
    }
  }
  return slots;
}

/** The tile in hand on the 38-tile board (the recorded next move) and its slots in every rotation. */
const TILES = BOARD_38.tiles;
const HAND = { plan: BOARD_38.next.plan, orientation: BOARD_38.next.orientation };
const slotsAt = (orientation: number) => slotsOf(TILES, HAND.plan, orientation);
const fitsAt = (slot: Slot, orientation: number) => slotsAt(orientation).some((s) => s.x === slot.x && s.y === slot.y);
/** The slot the recorded move takes: its rotation fits there. */
const CHOSEN: Slot = { x: BOARD_38.next.x, y: BOARD_38.next.y };
/** A rotation that does not fit there: the placed tile turns red. */
const RED_ORIENTATION = [1, 2, 3, 4].find((o) => !fitsAt(CHOSEN, o)) ?? HAND.orientation;

function inHand(orientation: number, chosen: Slot | null): Pick<BoardSceneProps, "tiles" | "slots" | "ghost" | "hand"> {
  const slots: BoardSlot[] = boardSlots(slotsAt, orientation);
  const fits = chosen ? fitsAt(chosen, orientation) : true;
  return {
    tiles: TILES,
    slots,
    ghost: chosen ? { ...chosen, plan: HAND.plan, orientation, placed: true, fits } : null,
    hand: { tile: { plan: HAND.plan, orientation }, state: "placing", slotChosen: chosen !== null && fits, preview: chosen && fits ? 30 : null },
  };
}

/** The board scene over the real renderer, with the renderer's settings (the day and night cycle's stories). */
function renderBoard(args: BoardSceneProps, settings?: RendererSettingsInput) {
  return (
    <BoardScene
      {...args}
      canvas={
        <BoardViewport
          tiles={args.tiles}
          gameId={args.gameId}
          basePath={APP_ASSETS}
          slots={args.slots}
          ghost={args.ghost}
          confirmed={args.confirmed}
          placementHighlight={args.placementHighlight}
          settings={settings}
        />
      }
      renderHandTile={(t) => <TileView {...t} basePath={APP_ASSETS} tileArt={originalTileArt(SOURCE_ASSETS)} />}
    />
  );
}

/** The day and night cycle as the game turns it on (Settings, "Day/night cycle"), ten times as fast; and held at a night. */
const DAY_NIGHT_FAST: RendererSettingsInput = { dayNight: { enabled: true, speed: 10 } };
const DAY_NIGHT_NIGHT: RendererSettingsInput = { dayNight: { enabled: true, season: "summer", freezeAt: DAY_PHASE_AT.night } };

/**
 * The game board, with the real renderer on the bench's recorded boards (`packages/game-core/bench/fixtures`): the hand,
 * the score, the tiles left, the time before `expires_at`, the closing points. One story per state; the Viewport control
 * reframes it. The board draws the placement visuals as the game does (PLATES, P-74): a plate on every free cell next
 * to a tile, blue where some rotation of the tile in hand fits,
 * invalid (grey) where none does, and the tile placed on a plate (tinted yellow, or red where its rotation does not
 * fit), from the engine's rule on the recorded board.
 */
const meta = {
  title: "Scenes/Board",
  component: BoardScene,
  args: { onBack: fn(), onRotate: fn(), onConfirm: fn(), onDiscard: fn(), onSurrender: fn() },
  render: (args) => renderBoard(args),
} satisfies Meta<typeof BoardScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A tile in hand, no slot chosen: its plates on the board, valid, possible and invalid. */
export const Placing: Story = { args: { ...BOARD.placing, ...inHand(HAND.orientation, null) } };

/** No tile to place (a move on its way): no plate. */
export const Idle: Story = { args: { ...BOARD.pending, slots: [], ghost: null } };

/** The tile placed on a plate its rotation fits: tinted yellow, Confirm on. */
export const PlacedLegal: Story = { args: { ...BOARD.placing, ...inHand(HAND.orientation, CHOSEN) } };

/** Turned to a rotation that does not fit its slot: the tile tinted red, Confirm off. */
export const PlacedIllegal: Story = { args: { ...BOARD.placing, ...inHand(RED_ORIENTATION, CHOSEN) } };

type PlatesArgs = BoardSceneProps & { rotation: number; placed: boolean };

/**
 * The three plate states at once on the partly filled 38-tile board, with the tile in hand's rotation as a control:
 * each turn eases the plates to their new states (150 ms); `placed` puts the tile on the recorded move's slot.
 */
export const Plates: StoryObj<PlatesArgs> = {
  args: { ...BOARD.placing, rotation: HAND.orientation, placed: false },
  argTypes: {
    rotation: { control: "inline-radio", options: [1, 2, 3, 4], description: "The tile in hand's rotation, 1 North to 4 West" },
    placed: { control: "boolean", description: "The tile placed on the recorded move's slot (red where this rotation does not fit there)" },
  },
  render: ({ rotation, placed, ...args }) => renderBoard({ ...args, ...inHand(rotation, placed ? CHOSEN : null) }),
};

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

/** A tile in hand under the day and night cycle (DAYNIGHT, P-73), ten times as fast: a day and a night every 12 s. */
export const DayNight: Story = { args: { ...BOARD.placing, ...inHand(HAND.orientation, null) }, render: (args) => renderBoard(args, DAY_NIGHT_FAST) };

/** The same, held at a summer night: the cities and the road's buildings lit, the plates and the tint readable. */
export const DayNightAtNight: Story = { args: { ...BOARD.placing, ...inHand(HAND.orientation, CHOSEN) }, render: (args) => renderBoard(args, DAY_NIGHT_NIGHT) };
