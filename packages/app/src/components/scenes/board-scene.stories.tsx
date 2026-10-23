import { useEffect, useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { BoardTile } from "@paved/chain";
import { Direction, DirectionType, Layout, Orientation, Plan } from "@paved/game-core";
import { DAY_PHASE_AT, type RendererSettingsInput } from "@paved/renderer";
import { boardSlots, type BoardSlot, type Slot } from "../../data/placement";
import { useBoardSettings } from "../../data/board-settings";
import { BOARD_FOG } from "../../data/settings";
import { APP_ASSETS, SOURCE_ASSETS, appRenders, originalTileArt } from "../../mocks/assets";
import { BOARD_38 } from "../../mocks/board";
import { BOARD } from "../../mocks/scenes";
import { Notice } from "../elements/notice";
import { toastCompletion } from "../containers/completion-toasts";
import { Toaster } from "../ui/sonner";
import { BoardViewport } from "../containers/board-viewport";
import { StoryCoach, StoryEnd } from "../containers/story-panels";
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
const QUEUE = BOARD.queue.hand.coming;
const TILES = BOARD_38.tiles;
const HAND = { plan: BOARD_38.next.plan, orientation: BOARD_38.next.orientation };
const slotsAt = (orientation: number) => slotsOf(TILES, HAND.plan, orientation);
const fitsAt = (slot: Slot, orientation: number) => slotsAt(orientation).some((s) => s.x === slot.x && s.y === slot.y);
/** The slot the recorded move takes: its rotation fits there. */
const CHOSEN: Slot = { x: BOARD_38.next.x, y: BOARD_38.next.y };
/** The rotations that fit there: the bubble's Rotate goes through these only. */
const VALID = [1, 2, 3, 4].filter((o) => fitsAt(CHOSEN, o));

function inHand(orientation: number, chosen: Slot | null): Pick<BoardSceneProps, "tiles" | "slots" | "ghost" | "hand" | "bubble"> {
  const slots: BoardSlot[] = boardSlots(slotsAt, orientation);
  const fits = chosen ? fitsAt(chosen, orientation) : true;
  return {
    tiles: TILES,
    slots,
    ghost: chosen ? { ...chosen, plan: HAND.plan, orientation, placed: true, fits } : null,
    hand: { tile: { plan: HAND.plan, orientation }, state: "placing", slotChosen: chosen !== null && fits, cellChosen: chosen !== null, preview: chosen && fits ? 30 : null },
    bubble: chosen ? { cell: chosen, rotations: VALID.length, onRotate: fn(), onClose: fn(), onDiscard: fn(), discardCost: 50, onConfirm: fn(), canConfirm: fits } : null,
  };
}

/** The board scene over the real renderer, with the renderer's settings (the day and night cycle's stories). */
function renderBoard(args: BoardSceneProps, settings?: RendererSettingsInput, fogOwned?: ReadonlyArray<{ x: number; y: number }>) {
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
          bubble={args.bubble}
          placementHighlight={args.placementHighlight}
          settings={settings}
          fogOwned={fogOwned}
        />
      }
      renderHandTile={(t) => <TileView {...t} basePath={APP_ASSETS} tileArt={originalTileArt(SOURCE_ASSETS)} />}
    />
  );
}

/** The day and night cycle as the game turns it on (Settings, "Day/night cycle"), ten times as fast; and held at a night. */
const DAY_NIGHT_FAST: RendererSettingsInput = { dayNight: { enabled: true, speed: 10 } };
const DAY_NIGHT_NIGHT: RendererSettingsInput = { dayNight: { enabled: true, season: "summer", freezeAt: DAY_PHASE_AT.night } };
/** The fog as the game turns it on, the ambient effects on, held at a summer's day or night. */
const FOG_DAY: RendererSettingsInput = { ambient: { enabled: true }, fog: BOARD_FOG, dayNight: { enabled: true, season: "summer", freezeAt: DAY_PHASE_AT.day } };
const FOG_NIGHT: RendererSettingsInput = { ...FOG_DAY, dayNight: { enabled: true, season: "summer", freezeAt: DAY_PHASE_AT.night } };

/**
 * The game board, with the real renderer on the bench's recorded boards (`packages/game-core/bench/fixtures`): the hand,
 * the score, the tiles left, the time before `expires_at`, the closing points. One story per state; the Viewport control
 * reframes it. The board draws the placement visuals as the game does (PLATES, P-74): a plate on every free cell next
 * to a tile, one grey (#588): playable (less transparent) where a rotation of the tile in hand fits,
 * invalid (more transparent) where none does, and the tile placed on a plate (a yellow tint), from
 * the engine's rule on the recorded board.
 */
const meta = {
  title: "Scenes/Board",
  component: BoardScene,
  args: { onBack: fn(), onDiscard: fn(), onSurrender: fn(), onRestart: fn(), tileRenders: appRenders },
  render: (args) => renderBoard(args),
} satisfies Meta<typeof BoardScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A tile in hand, no slot chosen: its plates on the board, playable and invalid. */
export const Placing: Story = { args: { ...BOARD.placing, ...inHand(HAND.orientation, null) } };

/** #705: a Challenge under its threshold: the HUD shows the score to beat beside the time left (past it, the reward, as in Placing). */
export const BelowThreshold: Story = { args: { ...BOARD.belowThreshold, ...inHand(HAND.orientation, null) } };

/** No tile to place (a move on its way): no plate. */
export const Idle: Story = { args: { ...BOARD.pending, slots: [], ghost: null } };

/**
 * The tile placed on a plate its rotation fits: opaque with a faint yellow (#605), the bubble on its corner (Close, Rotate when several
 * rotations fit, Validate to hold), the points it would score over the HUD's score: "(+30)".
 */
export const PlacedLegal: Story = { args: { ...BOARD.placing, ...inHand(HAND.orientation, CHOSEN) } };

/** Opens the gear's settings over the board. */
const openSettings: Story["play"] = async ({ canvasElement }) => {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Settings" }));
  await waitFor(() => expect(within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Settings" })).toBeInTheDocument());
};

/**
 * The gear opened in a Challenge: the device settings over the board, a bottom sheet on a phone (375 px), a side panel on a
 * desktop (1440 px); "This game" first, with Surrender (#606), which asks in its dialog.
 */
export const SettingsOpen: Story = { args: { ...BOARD.placing, ...inHand(HAND.orientation, null) }, play: openSettings };
/** The settings in Training: Restart (the same game from its first tile, same deck), confirmed by a dialog. No Surrender. */
export const SettingsTraining: Story = { args: { ...BOARD.storageDisabled, storageDisabled: false, ...inHand(HAND.orientation, null) }, play: openSettings };
/** The settings in Story mode: Restart level, confirmed by a dialog. */
export const SettingsStory: Story = {
  args: { ...BOARD.placing, ...inHand(HAND.orientation, null), mode: "story", gameId: undefined, expiresAt: null, title: "Tutorial 5: Under the trees" },
  play: openSettings,
};

/** A tap on the tile stack: the deck sheet, its chips the real tiles seen from above (the toggle switches to the simplified view). */
export const DeckOpen: Story = {
  args: { ...BOARD.placing, ...inHand(HAND.orientation, null) },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Tiles left/ }));
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Deck" })).toBeInTheDocument());
  },
};

/** The tile in hand fits no cell in any rotation: no plate is playable, the stack's Discard says so and stays offered. */
export const FitsNowhere: Story = {
  args: { ...BOARD.placing, ...inHand(HAND.orientation, null), slots: [], hand: { tile: HAND, state: "placing", fitsNowhere: true } },
};

type PlatesArgs = BoardSceneProps & { rotation: number; placed: boolean };

/**
 * The three plate states at once on the partly filled 38-tile board, with the tile in hand's rotation as a control:
 * each turn eases the plates to their new states (150 ms); `placed` puts the tile on the recorded move's slot.
 */
export const Plates: StoryObj<PlatesArgs> = {
  args: { ...BOARD.placing, rotation: HAND.orientation, placed: false },
  argTypes: {
    rotation: { control: "inline-radio", options: [1, 2, 3, 4], description: "The tile in hand's rotation, 1 North to 4 West" },
    placed: { control: "boolean", description: "The tile placed on the recorded move's slot" },
  },
  render: ({ rotation, placed, ...args }) => renderBoard({ ...args, ...inHand(rotation, placed ? CHOSEN : null) }),
};

/** A slot chosen (plan view): the bubble above the tile stack (Cancel, Discard, Rotate, Validate), the points on the HUD's score. */
export const SlotChosen: Story = { args: { ...BOARD.slotChosen, hand: { ...BOARD.slotChosen.hand, cellChosen: true }, bubble: { ...BOARD.slotChosen.bubble, onDiscard: fn(), discardCost: 50 } } };

/** The last move closed a city and a forest: the points appear over the board. */
export const ClosingPoints: Story = { args: BOARD.closing };

/** A move sent: the tile pulses on the board until its receipt. */
export const PendingMove: Story = { args: BOARD.pending };

export const RefusedMove: Story = { args: BOARD.refused };

/** 24 h passed: the banner above the stack carries Surrender, the only move left. */
export const Expired: Story = { args: BOARD.expired };

/** 24 h passed, as the Challenge board opens it (P5): the Surrender dialog opens by itself. */
export const ExpiredPrompt: Story = { args: { ...BOARD.expired, promptSurrender: true } };

/**
 * A Challenge game with no account connected (P5): the board read only. The stack is the same as the player's (#701): the game's
 * tile in hand and the next two over the pile, nothing to play (no hint, no Discard); a tap opens the deck.
 */
export const ReadOnly: Story = {
  args: {
    ...BOARD.queue,
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

/**
 * The fog of war as every mode draws it (FOG-EVERYWHERE, #648; the owner's variant of #633): fog over everything but the tiles
 * and the free slots next to them, the landscape beyond a soft edge, every corner rounded. Held at a summer's noon; at night the
 * fog dims to a moonlit blue.
 */
export const Fog: Story = { args: BOARD.large, render: (args) => renderBoard(args, FOG_DAY) };

/** The fog at a summer night. */
export const FogAtNight: Story = { args: BOARD.large, render: (args) => renderBoard(args, FOG_NIGHT) };

/**
 * The fog in a village or an attack (the prop `fogOwned`, which the village and PvP screens set): the owned cells and the cells
 * next to them stay clear, built or not. Here the recorded board's first twelve cells, its first eight built.
 */
export const FogVillage: Story = {
  args: { ...BOARD.large, tiles: BOARD.large.tiles.slice(0, 8) },
  render: (args) => renderBoard(args, FOG_DAY, BOARD.large.tiles.slice(0, 12).map((t) => ({ x: t.x, y: t.y }))),
};

function WithDial(args: BoardSceneProps) {
  const board = useBoardSettings();
  // The cycle ten times as fast (a day and a night every 12 s), so the dial's turn shows.
  const settings = useMemo<RendererSettingsInput>(() => ({ ...board.renderer, dayNight: { ...board.renderer.dayNight, speed: 10 } }), [board.renderer]);
  return (
    <BoardScene
      {...args}
      seasonWheel={board.wheel}
      canvas={<BoardViewport tiles={args.tiles} basePath={APP_ASSETS} slots={args.slots} ghost={args.ghost} bubble={args.bubble} settings={settings} onScene={board.onScene} />}
      renderHandTile={(t) => <TileView {...t} basePath={APP_ASSETS} tileArt={originalTileArt(SOURCE_ASSETS)} />}
    />
  );
}

/**
 * The season dial on the board (#607), at its bottom left on every screen size (#682), on the stack's bottom line. Wired as the game wires it (`useBoardSettings`), the cycle ten times as fast; a tap goes auto, summer, autumn, winter,
 * spring, auto (the Day and night setting off starts it on summer).
 */
export const SeasonDial: Story = { args: { ...BOARD.placing, ...inHand(HAND.orientation, null) }, render: (args) => <WithDial {...args} /> };

/** The dial ringed by a Story coach mark (Tutorial 6). */
export const StoryCoachWheel: Story = {
  args: {
    ...BOARD.placing,
    ...inHand(HAND.orientation, null),
    mode: "story",
    gameId: undefined,
    expiresAt: null,
    title: "Tutorial 6: Seasons",
    coach: "wheel",
    notices: <StoryCoach tip="The season wheel turns the board through the seasons. Tap it to step on; the score does not change." onDismiss={fn()} />,
  },
  render: (args) => <WithDial {...args} />,
};

/** A dial that stays put, for the boards without a scene (the plan view). */
const STILL_WHEEL: BoardSceneProps["seasonWheel"] = { state: "summer", onNext: fn(), read: null };

/**
 * #682: the dial beside the widest hand, the stack's Discard and the two coming tiles. They sit side by side from 375 px
 * (the dial 64 px under 390 px); at 320 and 360 px the Discard and the queue go above the stack rather than overlap the dial.
 */
export const SeasonDialQueue: Story = {
  args: { ...BOARD.queue, ...inHand(HAND.orientation, null), hand: { ...inHand(HAND.orientation, null).hand, coming: QUEUE } },
  render: (args) => <WithDial {...args} />,
};

/** #682: the plan view (no WebGL), a slot chosen: the bubble centred above the stack, clear of the dial. */
export const SeasonDialBubble: Story = {
  args: { ...BOARD.placing, ...inHand(HAND.orientation, CHOSEN), hand: { ...inHand(HAND.orientation, CHOSEN).hand, coming: QUEUE }, seasonWheel: STILL_WHEEL },
  render: (args) => <BoardScene {...args} />,
};

/** #682: a read-only board (spectating, a final board) keeps the dial at its bottom left, the stack alone at the right. */
export const SeasonDialReadOnly: Story = { args: { ...ReadOnly.args, ...inHand(HAND.orientation, null) }, render: (args) => <WithDial {...args} /> };

/**
 * A Story level in play (#546): its name in the header, its fixed deck on the deck sheet, the tip of the control it introduces
 * ringed; the stack shows the next two tiles of the level's order (#701).
 */
export const StoryCoachDeck: Story = {
  args: {
    ...BOARD.placing,
    ...inHand(HAND.orientation, null),
    hand: { ...inHand(HAND.orientation, null).hand, coming: QUEUE },
    mode: "story",
    gameId: undefined,
    expiresAt: null,
    title: "Tutorial 5: Under the trees",
    coach: "deck",
    notices: <StoryCoach tip="Tap the tile stack: the deck sheet shows every tile this level deals, and the ones already played." onDismiss={fn()} />,
  },
};

/** Story coach marks on the stack: its Discard ringed (Tutorial 3), no Surrender in Story mode. */
export const StoryCoachDiscard: Story = {
  args: {
    ...BOARD.placing,
    ...inHand(HAND.orientation, null),
    mode: "story",
    gameId: undefined,
    expiresAt: null,
    title: "Tutorial 3: Not this one",
    coach: "discard",
    score: 0,
    notices: <StoryCoach tip="This tile only gets in the way: hold the trash by the tile stack to discard it. At 0 points a discard is free." onDismiss={fn()} />,
  },
};

/** A Story level's end over its board (#593): the stars fill, then the score and the points short of the next star; Replay (the last level: no Next). */
export const StoryEndOnBoard: Story = {
  args: {
    ...BOARD.placing,
    mode: "story",
    gameId: undefined,
    expiresAt: null,
    title: "Open Country 11: A full road",
    score: 9120,
    remaining: 0,
    // Over: no tile left in hand, as the page gives it.
    hand: { tile: null, state: "empty" },
    readOnly: true,
    // The campaign's last level: no Next.
    notices: <StoryEnd title="A full road" score={9120} stars={1} toNextStar={942} bestKnown previousBest={8400} onReplay={fn()} onLevels={fn()} />,
  },
};

/** Raises a completion toast over the board a second in, as the app's tracking does when a game completes a mission (#595). */
function BoardWithToast(args: BoardSceneProps) {
  useEffect(() => {
    const t = setTimeout(() => toastCompletion("quest", "quest:6:story", { title: "Public Works", icon: "city", cobbles: 10 }), 1_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      {renderBoard(args)}
      <Toaster />
    </>
  );
}

/** #595: a mission completed during the game toasts on the board, at the top, clear of the hand. */
export const MissionCompleted: Story = { args: { ...BOARD.placing, ...inHand(HAND.orientation, null) }, render: (args) => <BoardWithToast {...args} /> };

/** #645: the tile to place and, smaller beside it, the two coming tiles (read only), in a Challenge on the VRF. */
export const Queue: Story = { args: { ...BOARD.queue, ...inHand(HAND.orientation, null), hand: { ...inHand(HAND.orientation, null).hand, coming: QUEUE } } };
/** #645: a Challenge move on its way: the next tile waits as the one to place, the one after it is shown, the chain draws the last. */
export const QueueDrawing: Story = { args: BOARD.queueDrawing };
/** #645: Training, the same queue from its local random. */
export const QueueTraining: Story = {
  args: { ...BOARD.queueTraining, ...inHand(HAND.orientation, null), hand: { ...inHand(HAND.orientation, null).hand, coming: QUEUE } },
};
/** #645: the deck's last two tiles: one coming. */
export const QueueLast: Story = { args: BOARD.queueLast };
