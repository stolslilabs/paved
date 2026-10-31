import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import type { TileSkins } from "@paved/renderer";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { SpinnerIcon } from "../ui/icons";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { TileChip, chipVariants, planCode, type TileArt } from "../elements/tile-chip";
import { TileRender, type TileRenders } from "../elements/tile-render";
import { Slab, TILT, TURN } from "../elements/tile-slab";
import { COACH_RING, type CoachTarget } from "./coach";
import { DiscardHold } from "./discard-hold";
import type { StackTile } from "./stack-view";

/**
 * Where the hand is: `placing` (choose a slot, confirm), `pending` (a move sent, its receipt awaited),
 * `refused` (the last move came back refused), `expired` (the 24 h passed: only surrender), `empty` (no tile: over).
 */
export type HandState = "placing" | "pending" | "refused" | "expired" | "empty";

/**
 * The stack's scene in px at `--stack-s` 1, z up, in one scale with the renderer's world (a tile is 3 units, `TILE_SIZE`):
 * the CSS pile and the 3D tiles over it (`StackView`) meet.
 */
export const UNIT_PX = 20;
/** A tile's side and the pile's, px (`TILE_SIZE` units); the tile in hand is drawn `HAND_SCALE` larger. */
const TILE = 3 * UNIT_PX;
const HAND_SCALE = 1.4;
/** The tallest tile model's top above its base, px (2.625 units): the stack's box takes it in. */
const TILE_TOP = 2.625 * UNIT_PX;
/** A tile's thickness as a CSS slab (without the 3D view), px. */
const SLAB_T = 6;
/**
 * The pile: a layer per tile left (N tiles show N), each a slab `PILE_SLAB` px thick, `PILE_GAP` px apart, up to `PILE_CAP` layers; past
 * that the layers thin so the pile stays as tall as `PILE_CAP` of them (a taller one would crowd a phone's board). With the 3D view a slab is a real tile of the deck, squashed, turned a quarter at random and a
 * little askew (up to `PILE_YAW` degrees); without it, a row of grass over a row of earth (`PILE_GRASS`).
 */
export const PILE_CAP = 12;
const PILE_SLAB = 6;
const PILE_GRASS = 2.5;
const PILE_GAP = 3;
const PILE_STEP = PILE_SLAB + PILE_GAP;
const PILE_GAP_SHARE = PILE_GAP / PILE_STEP;
/** One layer's height at `n` layers: `PILE_STEP`, thinner past `PILE_CAP` layers so the pile never grows taller than that. */
const pileStep = (n: number) => Math.min(PILE_STEP, (PILE_CAP * PILE_STEP) / Math.max(1, n));
const PILE_YAW = 7;
/**
 * How far the top tiles lean toward the view (after Dorfromantik's), each keeping the stack's angle in the plane: the tile
 * in hand `TOP_LEAN` degrees, to within 10 of straight above (its edge still shows); the next `NEXT_LEAN` of that; the one
 * after it not at all, as the pile.
 */
const TOP_LEAN = TILT - 10;
const NEXT_LEAN = 0.5;

/** A tile's lean toward the view, `share` of `TOP_LEAN`, about the axis across the view (`TileRenderData.lean`). */
function facing(share: number): { lean?: { angle: number; toward: number } } {
  return share ? { lean: { angle: rad(TOP_LEAN * share), toward: rad(TURN) } } : {};
}

/** The same lean for a CSS slab in the stack's scene: about the axis across the view (the scene's turn undone, then redone). */
const facingCss = (share: number) => (share ? ` rotateZ(${-TURN}deg) rotateX(${-TOP_LEAN * share}deg) rotateZ(${TURN}deg)` : "");

/** The ids of the pile's tiles in the 3D view, one per layer from the bottom (apart from the draw ids). */
const PILE_IDS = 1_000;
/** Every plan (chain ids 1 to 19): the pile's tiles without the deck's plans. */
const ALL_PLANS = Array.from({ length: 19 }, (_, i) => i + 1);

/** A layer's draw, the same each render: a 32-bit hash of its index (so the pile does not reshuffle as it sinks). */
function layerHash(i: number): number {
  let h = Math.imul(i + 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
/**
 * How high the tiles hover, base to base, px: the first on the pile (a hair above it), the next well above the one after it,
 * the tile in hand above the next. The gaps show each tile whole but for the back of the one under it.
 */
const GAP_PILE = 2;
const STEP_NEXT = 108;
const STEP_HAND = 150;
/**
 * How far around the tiles-left badge's centre the stack's outline reaches, px of the scene: the badge is 32 px (and its
 * shadow) whatever `--stack-s`, so at the phone's 0.8 the outline must reach (16 + 3) / 0.8, or it cuts the badge.
 */
const BADGE = 24;
/** The badge's height on the pile's edge, px: the same at every count. */
const BADGE_Z = 6;
/** The draw order the stack's tiles are known by in the 3D view: the next keeps its id as it becomes the tile in hand. */
const DRAW_IDS = 10_000;
/** The hint comes back after this long without a move or a cell chosen, ms. */
export const HINT_IDLE_MS = 20_000;
/** The next tile comes up: a short rise, ms. */
const RISE_MS = 260;
/** The tiles shown after the one to place (#645): the next and the one after it. */
export const QUEUE_SLOTS = 2;

export interface TileStackProps {
  /** The tile to place (`SessionState.hand` with its orientation); null when there is none. */
  tile: { plan: number; orientation: number } | null;
  state: HandState;
  /** Tiles still to draw (`GameView.remainingCount`): the badge, and the pile's height, a layer each up to `PILE_CAP`. */
  remaining: number;
  /**
   * The tiles known after the one to place, in draw order (#645): the next and the one after it, smaller, on the stack
   * under the tile in hand (the next hovering, the one after it on the pile). Read only: no rotation, no placement. None
   * in a game that knows only its tile in hand.
   */
  coming?: readonly { plan: number }[];
  /** The chain is drawing the queue's last tile (a Challenge move on its way): its slot waits, after the known ones. */
  drawing?: boolean;
  /** A cell is chosen on the board (the tile is on it, the bubble's): the top is dimmed and the stack's Discard goes. */
  cellChosen?: boolean;
  /** No cell takes the tile in any rotation: the stack's Discard says so. */
  fitsNowhere?: boolean;
  /** Why the move was refused. */
  error?: string | null;
  /** The refusal's detail for support (its typed name, hash, game, version, time): the page builds it. */
  errorDetail?: ErrorDetail;
  /** Where the board's tile art is served (`TileChip`'s `art`, from `useTileArt`). */
  tileArt?: TileArt;
  /** The tiles' build-time renders (`useTileRenders`): the coming tiles draw their top-down ones (#679); the chip without one. */
  renders?: TileRenders;
  /** The board's skins (plan key to theme): each coming tile in the theme the board draws it in, the base models without one. */
  skins?: TileSkins;
  /**
   * Draws the stack's tiles with the renderer (`StackView`): the tile in hand and the coming ones with their height and
   * voxels, in one transparent canvas over the pile. The page gives it where WebGL is; without it (tests, the plan view) the
   * tiles are CSS slabs, their tops the top-down renders.
   */
  renderStack?: (view: StackFrame) => ReactNode;
  /** The deck's plans (chain ids, a card each), the pile's tiles in the 3D view are drawn from; unset: every plan. */
  pilePlans?: readonly number[];
  /** Draws the tile in hand with the renderer (`TileView`) on its CSS slab, without `renderStack`. */
  renderTile?: (tile: { plan: number; orientation: number }) => ReactNode;
  /** A tap on the stack: the deck sheet (#540). */
  onDeck?: () => void;
  /** The end of a hold on the stack's Discard. */
  onDiscard?: () => void;
  /** What a discard costs now (at most the score); 0 or none: free. */
  discardCost?: number;
  /** The Discard hold's length, ms (`HOLD_MS` by default; the stories tune it). */
  holdMs?: number;
  /** The expired banner's Surrender: the only move left. */
  onSurrender?: () => void;
  /** The Surrender dialog's module is on its way (BOARD-CHUNK): the banner's button shows it is busy. */
  surrenderPending?: boolean;
  /** A Story coach mark points at the deck (the stack is ringed) or at Discard (the stack's Discard is). */
  coach?: CoachTarget | null;
  /**
   * A board the viewer does not play (another player's game, a Story level's intro or end): the same stack, its tiles and the
   * deck (#701), with nothing to play: no hint, no banner, no Discard.
   */
  readOnly?: boolean;
  className?: string;
}

/** What the stack's 3D view draws (`StackView`'s props but the assets): its tiles, and its framing over the stack's box. */
export interface StackFrame {
  tiles: StackTile[];
  /** Where a tile that was not there comes from: the pile's top, world units. */
  enterLift: number;
  /** The world point at the box's centre. */
  target: [number, number, number];
  /** The box's height, px at `--stack-s` 1, and the px per world unit: the camera's zoom. */
  heightPx: number;
  unitPx: number;
  /** The 3D view could not start: the stack draws its CSS slabs from then on. */
  onError: () => void;
}

/** Whether the hint shows: at the start, then again after `HINT_IDLE_MS` without a move or a cell chosen. */
function useHint(active: boolean, moveKey: number, cellChosen: boolean): boolean {
  const [shown, setShown] = useState(true);
  // A move (the key changed) or a cell chosen hides it; a second run of the same effect (StrictMode) does not.
  const last = useRef({ moveKey, cellChosen });
  useEffect(() => {
    if (last.current.moveKey !== moveKey || last.current.cellChosen !== cellChosen) setShown(false);
    last.current = { moveKey, cellChosen };
    if (!active || cellChosen) return;
    const timer = setTimeout(() => setShown(true), HINT_IDLE_MS);
    return () => clearTimeout(timer);
  }, [active, moveKey, cellChosen]);
  return active && !cellChosen && shown;
}

/**
 * The theme whose top-down render of `plan` the manifest lists: the board's skin for it, else the base models; null for
 * none (the slot draws the chip). As the deck sheet's real view (`deckArt`, #606).
 */
function topTheme(plan: number, renders: TileRenders | undefined, skins: TileSkins | undefined): number | null {
  const key = planCode(plan).toLowerCase();
  if (!renders || !key) return null;
  const skin = skins?.[key] ?? 0;
  if (renders(skin, `${key}-top`) != null) return skin;
  return renders(0, `${key}-top`) != null ? 0 : null;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

type Point = readonly [number, number];

/**
 * Where a point of the stack's plane (`x` east, `y` south, `z` up, px from the pile's foot) lands on screen, px from there:
 * no perspective, as the 3D view's far camera (`StackView`). `tiltDeg`: the view's tilt (a leaning tile sees less of it).
 */
function project(x: number, y: number, z: number, tiltDeg = TILT): Point {
  const tilt = rad(tiltDeg);
  const turn = rad(TURN);
  const across = x * Math.cos(turn) - y * Math.sin(turn);
  const down = x * Math.sin(turn) + y * Math.cos(turn);
  return [across, down * Math.cos(tilt) - z * Math.sin(tilt)];
}

/** The world point (units, `y` up) that lands `dx`, `dy` px from the pile's foot on screen, in the plane facing the view. */
function unproject(dx: number, dy: number): [number, number, number] {
  const tilt = rad(TILT);
  const turn = rad(TURN);
  const [right, up] = [dx / UNIT_PX, -dy / UNIT_PX];
  return [right * Math.cos(turn) - up * Math.cos(tilt) * Math.sin(turn), up * Math.sin(tilt), -right * Math.sin(turn) - up * Math.cos(tilt) * Math.cos(turn)];
}

/**
 * A tile's corners on screen, its foot `z` px up the stack, leaning `share` of `TOP_LEAN` toward the view: leaning toward it,
 * a tile is seen as from a smaller tilt.
 */
function tileCorners(z: number, size: number, height: number, share: number): Point[] {
  const [fx, fy] = project(0, 0, z);
  const h = size / 2;
  return [-h, h].flatMap((x) =>
    [-h, h].flatMap((y) =>
      [0, height].map((up): Point => {
        const [sx, sy] = project(x, y, up, TILT - TOP_LEAN * share);
        return [fx + sx, fy + sy];
      }),
    ),
  );
}

/** A slab of the stack: its square, its base and its thickness, px. */
interface Level {
  size: number;
  z: number;
  height: number;
}

/** The convex hull of points on screen (Andrew's monotone chain), in order around it. */
function hullOf(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (from: readonly Point[]) => {
    const chain: Point[] = [];
    for (const p of from) {
      while (chain.length >= 2 && cross(chain[chain.length - 2]!, chain[chain.length - 1]!, p) <= 0) chain.pop();
      chain.push(p);
    }
    return chain.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

/**
 * The screen box the slabs fill, from their corners and those of the tiles above them (`faces`, already on screen): the stack's
 * layout size, its foot's place from the box's left and bottom, and its outline from the box's top left (with the `extra`
 * points, the badge's), what a tap on it takes.
 */
function frameOf(levels: readonly Level[], faces: readonly Point[], reach: readonly Point[], extra: readonly Point[]) {
  // The slabs' corners, and the corners of the leaning tiles, already on screen.
  const corners: Point[] = [...faces];
  for (const { size, z, height } of levels) {
    const h = size / 2;
    for (const [x, y] of [[-h, -h], [h, -h], [h, h], [-h, h]] as const) {
      for (const at of [z, z + height]) corners.push(project(x, y, at));
    }
  }
  // `reach`: the widest the stack gets (the tile in hand), counted for the sides always, so the box does not shift with the tiles.
  const xs = [...corners, ...reach].map((c) => c[0]);
  const ys = [...corners, ...reach].map((c) => c[1]);
  const [left, top] = [-Math.min(...xs), -Math.min(...ys)];
  const outline = hullOf([...corners, ...extra]).map(([x, y]): Point => [x + left, y + top]);
  return { width: Math.max(...xs) + left, height: Math.max(...ys) + top, left, bottom: Math.max(...ys), outline };
}

/**
 * The tiles' lowest reach, at the pile's foot (a tile in hand, a leaning one, the next): the box's sides and foot always keep
 * it, so they do not move as the pile sinks, a slot waits or the last tile leaves (the badge and the foot stay put).
 */
const HAND_REACH: Point[] = tileCorners(0, TILE * HAND_SCALE, SLAB_T, 1);

/** A length of the stack's scene on screen: px at `--stack-s`, the stack's scale (smaller on phones). */
const scaled = (px: number) => `calc(${px.toFixed(2)}px * var(--stack-s))`;

/** A tile's top as the stack's slabs show it: square, the board's dark outline. */
const FACE = "rounded-[3px] border border-slab-edge";

/**
 * The hand as a tile stack (#606, after Dorfromantik's): bottom right, in the thumb's reach, one object seen from above at
 * an angle, turned as the tile renders are (`TILT`, `TURN`). Its foot is the pile, a layer per tile left (up to
 * `PILE_CAP`), so it sinks as the game goes; above it hover the tile after next, the next (#645: read only; a slot waits
 * while the chain draws one) and, larger, the tile in hand in its rotation, each well apart and leaning more toward the view
 * than the one under it, the tile in hand nearly seen from above. With `renderStack` the tiles
 * are the board's own 3D models; without, CSS slabs with their top-down renders. A round badge at the pile's foot carries
 * the tiles left; at 0 it goes too. A tap on the stack opens the deck.
 * While no cell is chosen, a small bubble on the stack offers Discard, held as the bubble's (the player can always
 * discard, also when the tile fits nowhere); while the tile is on a cell the tile in hand is see-through: it is on the
 * board.
 * A refused move and the expired game show as a compact banner above it; the expired one carries Surrender. The hint
 * shows at the start and after a while without a move, never for good. No overlay of the stack blurs the board behind it:
 * a backdrop blur over the live canvas redraws as the board does, so a still board would not read as still (mobile-feel).
 */
export function TileStack({
  tile,
  state,
  remaining,
  coming = [],
  drawing = false,
  cellChosen = false,
  fitsNowhere = false,
  error,
  errorDetail,
  tileArt,
  renders,
  skins,
  renderStack,
  pilePlans = ALL_PLANS,
  renderTile,
  onDeck,
  onDiscard,
  discardCost,
  holdMs,
  onSurrender,
  surrenderPending = false,
  coach,
  readOnly = false,
  className,
}: TileStackProps) {
  const reduced = useReducedMotionConfig() ?? false;
  // Read only, the hand's state shows nowhere: the stack is the game's tiles and its deck.
  const live = readOnly ? null : state;
  const busy = live === "pending";
  const canDiscard = tile !== null && (live === "placing" || live === "refused");
  // No lit slot to tap when the tile fits nowhere: the stack's Discard says so instead.
  const hint = useHint(live === "placing" && tile !== null && !fitsNowhere, remaining, cellChosen);
  // The queue after the tile to place: at most two slots, the known tiles first, then the one the chain is drawing.
  const known = coming.slice(0, QUEUE_SLOTS);
  const waiting = drawing && known.length < QUEUE_SLOTS;
  const queued = known.length + (waiting ? 1 : 0);
  // The 3D view, unless it failed to start (a context lost to the cap, a model that did not load): then the CSS slabs.
  const [stackFailed, setStackFailed] = useState(false);
  const solid = renderStack != null && !stackFailed;

  // Bottom up: the pile, then each slot hovering above the one before (the queue's last first), then the tile in hand.
  const layers = Math.max(0, remaining);
  const step = pileStep(layers);
  const pileHeight = layers > 0 ? layers * step - step * PILE_GAP_SHARE : 0;
  const queueZ: number[] = [];
  let z = pileHeight + GAP_PILE;
  for (let i = queued - 1; i >= 0; i--) {
    queueZ[i] = z;
    z += i > 0 ? STEP_NEXT : STEP_HAND;
  }
  const handZ = z;
  // The pile, then the tiles above it as they lean (the 3D models stand up to `TILE_TOP`; the CSS slabs are thin).
  const levels: Level[] = [{ size: TILE, z: 0, height: pileHeight }];
  const tops = [
    ...queueZ.flatMap((at, i) => tileCorners(at, TILE, solid ? TILE_TOP : SLAB_T, i === 0 ? NEXT_LEAN : 0)),
    ...(tile ? tileCorners(handZ, TILE * HAND_SCALE, solid ? TILE_TOP * HAND_SCALE : SLAB_T, 1) : []),
  ];
  // The badge on the pile's south-west edge, low: the pile's left side on screen. Its height is fixed, so it keeps its place
  // as the pile sinks and the last tile leaves (the frame's sides too: `frameOf`'s `reach`).
  // At 0 the badge goes with the last tile (#701): the outline no longer takes it in, the box keeps its size.
  const [badgeX, badgeY] = project(-TILE / 2, TILE / 2, BADGE_Z);
  const badgeCorners = remaining > 0 ? [-BADGE, BADGE].flatMap((dx) => [-BADGE, BADGE].map((dy): Point => [badgeX + dx, badgeY + dy])) : [];
  const frame = frameOf(levels, tops, HAND_REACH, badgeCorners);
  const outline = frame.outline.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  // The next tile comes up (the Web Animations API, no frame of React's): the tile in hand from the next's place, each coming
  // tile from the slot under it, the last out of the pile. None under reduced motion. The 3D view glides its own.
  const handRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLLIElement | null)[]>([]);
  const last = useRef(remaining);
  const nextZ = queueZ[0];
  const thenZ = queueZ[1];
  useEffect(() => {
    if (last.current === remaining) return;
    last.current = remaining;
    if (reduced || solid) return;
    const timing = { duration: RISE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };
    const shrink = 1 / HAND_SCALE;
    handRef.current?.animate?.(
      [{ transform: `translateZ(${nextZ ?? pileHeight}px)${facingCss(NEXT_LEAN)} scale3d(${shrink}, ${shrink}, ${shrink})` }, { transform: `translateZ(${handZ}px)${facingCss(1)}` }],
      timing,
    );
    const [next, then] = slotRefs.current;
    if (nextZ !== undefined) next?.animate?.([{ transform: `translateZ(${thenZ ?? pileHeight}px)` }, { transform: `translateZ(${nextZ}px)${facingCss(NEXT_LEAN)}` }], timing);
    if (thenZ !== undefined) then?.animate?.([{ transform: `translateZ(${pileHeight}px)` }, { transform: `translateZ(${thenZ}px)` }], timing);
  }, [remaining, reduced, solid, handZ, nextZ, thenZ, pileHeight]);

  // The 3D view: the tiles by draw order (the next keeps its id as it becomes the tile in hand), lifts in world units, and
  // the world point at the box's centre.
  const view: StackFrame | null = solid
    ? {
        tiles: [
          // The pile: real tiles of the deck, bottom up, squashed to slabs, each turned and askew by its layer's draw.
          ...Array.from({ length: layers }, (_, i) => {
            const draw = layerHash(i);
            return {
              id: PILE_IDS + i,
              plan: pilePlans[draw % pilePlans.length] ?? 1,
              orientation: 1 + ((draw >>> 8) % 4),
              lift: (i * step) / UNIT_PX,
              scale: 1,
              thickness: (step * (1 - PILE_GAP_SHARE)) / UNIT_PX,
              yaw: rad(((((draw >>> 16) % 1001) / 1000) * 2 - 1) * PILE_YAW),
            };
          }),
          ...known.map((t, i) => ({ id: DRAW_IDS - remaining + i + 1, plan: t.plan, orientation: 1, lift: queueZ[i]! / UNIT_PX, scale: 1, ...facing(i === 0 ? NEXT_LEAN : 0) })),
          // The tile in hand fades while it is on a cell or its move is on its way: the board draws it.
          ...(tile ? [{ id: DRAW_IDS - remaining, plan: tile.plan, orientation: tile.orientation, lift: handZ / UNIT_PX, scale: HAND_SCALE, faded: cellChosen || busy, ...facing(1) }] : []),
        ],
        enterLift: pileHeight / UNIT_PX,
        target: unproject(frame.width / 2 - frame.left, frame.bottom - frame.height / 2),
        heightPx: frame.height,
        unitPx: UNIT_PX,
        onError: () => setStackFailed(true),
      }
    : null;

  const chipState = busy ? "pending" : live === "refused" ? "refused" : "default";
  // The slab's face: the chip's state on its edge (`chipVariants`: pending pulses, refused), the board's outline otherwise.
  const handFace = chipState === "default" ? FACE : "rounded-[3px]";
  const handLabel = tile ? `Tile ${planCode(tile.plan).toLowerCase()}, ${["north", "east", "south", "west"][(tile.orientation - 1 + 4) % 4]}` : "";
  return (
    <section
      aria-label={readOnly ? "Deck" : "Your tile"}
      data-state={state}
      data-input-surface
      data-bubble-avoid
      className={cn("pointer-events-none flex max-w-[min(20rem,calc(100vw-1rem))] flex-col items-end gap-2", className)}
    >
      {/* Refused and expired say why in the one error component (P-67); always rendered, so its height animates. */}
      <InlineError
        title={live === "expired" ? "Game expired" : live === "refused" ? "Move refused" : undefined}
        message={live === "refused" ? (error ?? "Choose another slot.") : live === "expired" ? "24 h passed since its purchase. Surrender to close it." : null}
        detail={errorDetail}
        action={
          live === "expired" && onSurrender ? (
            <Button size="sm" variant="destructive" onClick={onSurrender} loading={surrenderPending}>
              <Icon name="flag" size="sm" /> Surrender
            </Button>
          ) : undefined
        }
        className="pointer-events-auto w-full rounded-xl bg-card shadow-lg"
      />
      {(hint || busy) && (
        <p data-testid="hand-hint" className="rounded-full bg-card/95 px-3 py-1 text-xs text-muted-foreground shadow-sm">
          {busy ? "Placing…" : "Tap a lit slot on the board."}
        </p>
      )}
      {/* The row wraps on the narrowest phones: the stack's Discard, with its "fits nowhere", goes above the stack. */}
      <div className="flex flex-wrap items-end justify-end gap-2">
        {/* The stack's Discard: while no cell is chosen (then it is the bubble's, on the tile). */}
        {canDiscard && !cellChosen && onDiscard && (
          <div data-testid="stack-discard" className="pointer-events-auto mb-3 flex items-center gap-2 rounded-full border bg-card p-1 shadow-lg">
            {fitsNowhere && <span className="pl-2 text-xs text-muted-foreground">This tile fits nowhere</span>}
            <DiscardHold onDiscard={onDiscard} cost={discardCost} holdMs={holdMs} className={cn("size-11 rounded-full focus-visible:ring-offset-card", coach === "discard" && cn(COACH_RING, "rounded-full"))} />
          </div>
        )}
        <div data-testid="tile-stack" className="relative shrink-0 [--stack-s:0.8] tablet:[--stack-s:1]" style={{ width: scaled(frame.width), height: scaled(frame.height) }}>
          <Pile layers={layers} step={step} frame={frame} shadowOnly={solid} />
          {/* The scene: its origin the pile's foot, its plane turned and tilted as the renders' view; every level keeps the 3D. */}
          <div className="absolute size-0" style={{ left: scaled(frame.left), bottom: scaled(frame.bottom), transform: "scale(var(--stack-s))", transformOrigin: "0 0" }}>
            <div className="absolute size-0 transform-3d" style={{ transform: `rotateX(${TILT}deg) rotateZ(${TURN}deg)` }}>
              {/* The coming tiles (#645), in draw order: the next nearest the tile in hand. With the 3D view, their names only. */}
              {queued > 0 && (
                <ol aria-label="Coming tiles" data-testid="coming-tiles" className="absolute size-0 transform-3d">
                  {known.map((t, i) => (
                    <li
                      key={i}
                      ref={(el) => {
                        slotRefs.current[i] = el;
                      }}
                      data-coming={i + 1}
                      className="absolute size-0 transform-3d transition-transform duration-200 motion-reduce:transition-none"
                      style={{ transform: `translateZ(${queueZ[i]}px)${facingCss(i === 0 ? NEXT_LEAN : 0)}` }}
                    >
                      <span className="sr-only">{i === 0 ? "Next: " : "Then: "}</span>
                      {solid ? (
                        <span role="img" aria-label={`Tile ${planCode(t.plan).toLowerCase()}, north`} className="sr-only" />
                      ) : (
                        <Slab size={TILE} height={SLAB_T} face={<ComingFace plan={t.plan} renders={renders} skins={skins} tileArt={tileArt} />} />
                      )}
                    </li>
                  ))}
                  {waiting && (
                    <li data-coming="drawing" className="absolute size-0 transform-3d" style={{ transform: `translateZ(${queueZ[known.length]}px)${facingCss(known.length === 0 ? NEXT_LEAN : 0)}` }}>
                      <Slab
                        size={TILE}
                        height={SLAB_T}
                        face={
                          <span role="img" aria-label="The chain draws this tile" className="flex size-full items-center justify-center rounded-[3px] border-2 border-dashed border-input bg-card text-muted-foreground">
                            <SpinnerIcon />
                          </span>
                        }
                      />
                    </li>
                  )}
                </ol>
              )}
              {tile && (
                <div ref={handRef} data-stack-top className="absolute size-0 transform-3d transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `translateZ(${handZ}px)${facingCss(1)}` }}>
                  {solid ? (
                    <span role="img" aria-label={handLabel} className="sr-only" />
                  ) : (
                    <Slab
                      size={TILE * HAND_SCALE}
                      height={SLAB_T}
                      faded={cellChosen}
                      face={
                        // Each `GameCanvas` owns its canvas and frees its WebGL context on unmount (R-dispose, #397).
                        renderTile ? (
                          <span data-view="render" className={cn(chipVariants({ size: "lg", state: chipState }), "size-full", handFace)}>
                            {/* The view frames the tile with a little of the board around it: the face shows the tile only. */}
                            <span className="block size-full scale-110">{renderTile(tile)}</span>
                          </span>
                        ) : (
                          <TileChip plan={tile.plan} orientation={tile.orientation} art={tileArt} size="lg" state={chipState} className={cn("size-full", handFace)} />
                        )
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </div>
          {/* The 3D tiles over the CSS pile, in the same box and scale (`StackView`). */}
          {view && <div className="pointer-events-none absolute inset-0">{renderStack!(view)}</div>}
          {/* The deck: a tap on the stack's outline (not its box, whose corners are the board's), the badge's included. */}
          <button
            type="button"
            onClick={onDeck}
            disabled={!onDeck}
            aria-label={`Tiles left: ${remaining}. Show the deck`}
            data-coach={coach === "deck" ? "deck" : undefined}
            className="peer pointer-events-auto absolute inset-0 cursor-pointer outline-none"
            style={{ clipPath: `polygon(${frame.outline.map(([x, y]) => `${scaled(x)} ${scaled(y)}`).join(", ")})` }}
          >
            {remaining > 0 && (
              <span
                data-testid="tiles-left"
                className="numeric absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-card bg-foreground text-sm font-bold text-background shadow-md"
                style={{ left: scaled(frame.left + badgeX), top: scaled(frame.height - frame.bottom + badgeY) }}
              >
                {remaining}
              </span>
            )}
          </button>
          {/* The focus ring and the coach mark follow the stack's outline. */}
          <svg
            aria-hidden
            viewBox={`0 0 ${frame.width.toFixed(1)} ${frame.height.toFixed(1)}`}
            preserveAspectRatio="none"
            className={cn("pointer-events-none absolute inset-0 size-full overflow-visible", coach === "deck" ? "animate-pulse text-primary motion-reduce:animate-none" : "hidden text-ring peer-focus-visible:block")}
          >
            <polygon points={outline} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>
    </section>
  );
}

/**
 * The pile without the 3D view, drawn flat in the stack's box as the scene would show it (an SVG: crisp at any scale, the
 * phone's too): its shadow, then each layer bottom up, its top, then its south and east sides, a row of grass over a row of
 * earth. The gap between two layers shows the top of the one under it, in shade. With the 3D view, its shadow only.
 */
function Pile({ layers, step, frame, shadowOnly }: { layers: number; step: number; frame: ReturnType<typeof frameOf>; shadowOnly: boolean }) {
  const shadow = useId();
  const h = TILE / 2;
  const top = frame.height - frame.bottom;
  const points = (corners: readonly (readonly [number, number, number])[]) =>
    corners
      .map(([x, y, z]) => {
        const [sx, sy] = project(x, y, z);
        return `${(frame.left + sx).toFixed(2)},${(top + sy).toFixed(2)}`;
      })
      .join(" ");
  const side = (z0: number, z1: number, south: boolean) =>
    south ? points([[-h, h, z1], [h, h, z1], [h, h, z0], [-h, h, z0]]) : points([[h, h, z1], [h, -h, z1], [h, -h, z0], [h, h, z0]]);
  return (
    <svg
      aria-hidden
      data-stack-pile={layers}
      viewBox={`0 0 ${frame.width.toFixed(1)} ${frame.height.toFixed(1)}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      <defs>
        <filter id={shadow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      {/* Its shadow on the board, a little south-east of it. */}
      <polygon points={points([[-h + 4, -h + 4, 0], [h + 4, -h + 4, 0], [h + 4, h + 4, 0], [-h + 4, h + 4, 0]])} className="fill-slab-shadow" filter={`url(#${shadow})`} />
      {/* With the 3D view, its tiles are the renderer's: only the shadow here. */}
      {Array.from({ length: shadowOnly ? 0 : layers }, (_, i) => {
        const z0 = i * step;
        const z1 = z0 + step * (1 - PILE_GAP_SHARE);
        const grass = z1 - (PILE_GRASS * step) / PILE_STEP;
        return (
          <g key={i}>
            {/* Under another layer, its top is in that layer's shadow: the gap reads as space. */}
            <polygon points={points([[-h, -h, z1], [h, -h, z1], [h, h, z1], [-h, h, z1]])} className={i === layers - 1 ? "fill-pile-grass-top" : "fill-pile-gap"} />
            <polygon points={side(z0, z1, true)} className="fill-pile-earth" />
            <polygon points={side(grass, z1, true)} className="fill-pile-grass" />
            <polygon points={side(z0, z1, false)} className="fill-pile-earth-shade" />
            <polygon points={side(grass, z1, false)} className="fill-pile-grass-shade" />
          </g>
        );
      })}
    </svg>
  );
}

/** A coming tile's top: its top-down render, unturned (no orientation yet), in the theme the board draws it in; the chip without one. */
function ComingFace({ plan, renders, skins, tileArt }: { plan: number; renders?: TileRenders; skins?: TileSkins; tileArt?: TileArt }) {
  // The voxel look of the board and the hand (#679).
  const theme = topTheme(plan, renders, skins);
  if (theme == null) return <TileChip plan={plan} art={tileArt} size="md" className={cn("size-full", FACE)} />;
  return (
    // The chip's name and role, so the slot reads the same to a screen reader (and to the Training e2e).
    <span role="img" aria-label={`Tile ${planCode(plan).toLowerCase()}, north`} data-view="render" data-theme={theme} className={cn(chipVariants({ size: "md" }), "size-full", FACE)}>
      <TileRender plan={plan} theme={theme} renders={renders} alt="" top />
    </span>
  );
}
