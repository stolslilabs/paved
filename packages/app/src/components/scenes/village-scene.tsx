import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { Score } from "../elements/score";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { GameIcon } from "../elements/game-icon";
import { Skeleton } from "../ui/skeleton";
import { pickCellAt } from "../containers/cell-picker";
import { RewardSheet, type RewardOffer } from "../containers/reward-sheet";
import { SkinsStatusView, type SkinsStatus } from "../containers/skins-status";
import { TopBar } from "../containers/top-bar";
import { VillageBoard, type VillageBoardProps, type VillageFog, type VillagePlacing } from "../containers/village-board";
import { dropOrientation, legalCells, type Cell, type Village } from "../containers/village-rules";

/** A reward's tile placed on a free cell (`Rewards.claim_reward`'s place, #642). */
export interface VillagePlace {
  /** The tile's slot in the offer (0 to 2). */
  slot: number;
  plan: number;
  x: number;
  y: number;
  orientation: number;
}

/** Why the village is not shown: a guest (Connect), the reads on their way, a failed read (Retry). */
export type VillageStatus = SkinsStatus;

export interface VillageSceneProps {
  /** The village; omitted, `status` says why; null: the network has no village yet. */
  village?: Village | null;
  status?: VillageStatus | null;
  /** The own village is founded; false: the start it would get, and Found. */
  founded?: boolean;
  /** Rewards waiting to be opened (own village, no offer open): Open draws the next one's tiles. */
  pending?: number;
  /** The reward's read failed (own village): what happened, and Retry, in place of the reward. */
  rewardError?: { message: string; detail?: ErrorDetail } | null;
  /** The last write's refusal, until dismissed. */
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  /** The player's own village (rewards), or someone else's, read-only. */
  mode?: "own" | "visit";
  /** A visit: from the PvP scout (#647) or from a player's profile. */
  from?: "scout" | "profile";
  /** A reward waiting (after a game): its sheet shows under the board. */
  reward?: RewardOffer | null;
  /** The plan's fog (#633's village variant), when the plan is drawn. */
  fog?: VillageFog;
  /**
   * The board, given by the page: the 3D village with the fog of war (`VillageViewport`, #648), from the board's props the scene
   * computes. Unset: the plan (`VillageBoard`), which is also the fallback without WebGL.
   */
  renderBoard?: (board: VillageBoardProps) => ReactNode;
  /** The board's tile art (`useTileArt`); the plans' areas without it. */
  tileArt?: TileArt;
  /** A write on its way: every control waits. */
  busy?: boolean;
  /** Where the stories start: a reward's tile chosen. */
  initialSelected?: number | null;
  onBack?: () => void;
  onFound?: () => void;
  onOpenReward?: () => void;
  onDismissRefusal?: () => void;
  onConnect?: () => void;
  onRetry?: () => void;
  onPlace?: (place: VillagePlace) => void;
  onTakeCobbles?: () => void;
}

/**
 * What is under the pointer while a reward's tile is dragged: a board cell (the plan's `data-cell`, or the 3D board's picker,
 * `pickCellAt`), or nothing.
 */
function cellUnder(x: number, y: number): (Cell & { kind: string }) | null {
  const under = document.elementFromPoint?.(x, y);
  const el = under?.closest<HTMLElement>("[data-cell]");
  if (!el) return pickCellAt(under, x, y);
  const [cx, cy] = (el.dataset.cell ?? "").split(",").map(Number);
  return { x: cx!, y: cy!, kind: el.dataset.kind ?? "" };
}

/** A press becomes a drag past this many pixels (the sheets' slop); under it, it is a tap that chooses the tile. */
const DRAG_SLOP = 6;

/**
 * The village (#646, part of #637): the player's metagame and calling card. The board (owned cells, the fog beyond), the
 * village's score, the player's level and Cobbles. After a game a reward waits under the board: drag one of its three tiles to
 * a lit cell, or take Cobbles. A visit (from the PvP scout or a profile) shows someone else's village read-only. Data and
 * writes come as props and callbacks (the page wires them to `Village` and `Rewards`, #646 PR 2): a village not founded shows
 * its start and Found; rewards waiting show Open. The parcels, the copies and the tiers left with v2 (#739); the v2 village
 * (`VillageLayoutScene`) replaces this screen once its contracts are wired.
 */
export function VillageScene({ village, status, mode = "own", onBack, onConnect, onRetry, ...props }: VillageSceneProps) {
  if (village) return <VillageView village={village} mode={mode} onBack={onBack} onRetry={onRetry} {...props} />;
  const own = mode === "own";
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar title={own ? "My village" : "Village"} onBack={onBack} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-4">
        {status ? (
          <SkinsStatusView
            status={status}
            guestTitle="Connect to build your village"
            guestText="Your village is kept on your account: rewards after your games grow it, and others visit it."
            errorTitle="The village could not be read"
            skeleton={
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="aspect-square w-full rounded-2xl" />
              </div>
            }
            onConnect={onConnect}
            onRetry={onRetry}
          />
        ) : (
          village === null && (
            <Notice title="Villages are coming" icon={<GameIcon name="house-tree" size="sm" />}>
              Villages are not on this network yet: your rewards wait for them.
            </Notice>
          )
        )}
      </main>
    </div>
  );
}

function VillageView({
  village,
  mode = "own",
  from = "profile",
  founded = true,
  pending = 0,
  refusal = null,
  refusalDetail,
  rewardError = null,
  reward = null,
  fog = "village",
  renderBoard,
  tileArt,
  busy,
  initialSelected = null,
  onBack,
  onFound,
  onOpenReward,
  onDismissRefusal,
  onRetry,
  onPlace,
  onTakeCobbles,
}: Omit<VillageSceneProps, "village" | "status" | "onConnect"> & { village: Village }) {
  const own = mode === "own";
  const [selected, setSelected] = useState<number | null>(initialSelected);
  const [orientation, setOrientation] = useState(1);
  const [drag, setDrag] = useState<{ index: number; x: number; y: number; over: Cell | null } | null>(null);
  const press = useRef<{ index: number; x: number; y: number; moved: boolean; source: HTMLElement } | null>(null);
  const tapAfterDrag = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  // A new reward (or none) clears the choice.
  useEffect(() => {
    setSelected(initialSelected);
    setOrientation(1);
  }, [reward, initialSelected]);

  // A reward that could not be read is not offered: its error shows instead, with Retry.
  const offer = own && founded && !rewardError ? reward : null;
  const activeIndex = drag?.index ?? selected;
  const activePlan = offer && activeIndex != null ? (offer.plans[activeIndex] ?? null) : null;
  const placing: VillagePlacing | null =
    activePlan != null
      ? { plan: activePlan, orientation, legal: legalCells(village, activePlan) }
      : null;

  const place = (slot: number, plan: number, cell: Cell) => {
    const o = dropOrientation(village, plan, orientation, cell);
    if (o == null || busy) return;
    onPlace?.({ slot, plan, x: cell.x, y: cell.y, orientation: o });
    setSelected(null);
  };
  const drop = (index: number, target: (Cell & { kind: string }) | null) => {
    const plan = offer?.plans[index];
    if (plan == null || !target) return;
    if (target.kind === "legal") place(index, plan, target);
  };

  const startDrag = (index: number, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    stop.current?.();
    press.current = { index, x: e.clientX, y: e.clientY, moved: false, source: e.currentTarget };
    const move = (ev: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.moved && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) < DRAG_SLOP) return;
      p.moved = true;
      const over = cellUnder(ev.clientX, ev.clientY);
      setDrag({ index: p.index, x: ev.clientX, y: ev.clientY, over: over && over.kind === "legal" ? over : null });
    };
    const end = (ev: PointerEvent, dropped: boolean) => {
      const p = press.current;
      press.current = null;
      stop.current?.();
      if (!p?.moved) return;
      // Only a release over its own card is followed by a click on it: that click is the drag's end, not a tap. Released
      // anywhere else, no click comes, and the next tap must count. The timer drops the flag once the click had its chance.
      const target = document.elementFromPoint?.(ev.clientX, ev.clientY);
      if (target && p.source.contains(target)) {
        tapAfterDrag.current = true;
        setTimeout(() => (tapAfterDrag.current = false), 0);
      }
      setDrag(null);
      if (dropped) drop(p.index, cellUnder(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => end(ev, true);
    const cancel = (ev: PointerEvent) => end(ev, false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    stop.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      stop.current = null;
    };
  };

  const select = (index: number | null) => {
    // The click that ends a drag on its own card is not a tap.
    if (tapAfterDrag.current) {
      tapAfterDrag.current = false;
      return;
    }
    setSelected(index);
    setOrientation(1);
  };

  const title = own ? "My village" : `${village.owner}'s village`;
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar
        title={title}
        onBack={onBack}
      />
      {/* The shared header's own margin sets where the content starts, as on every page (HEADER-HEIGHT, #676). */}
      <div className="flex min-h-0 flex-1 flex-col desktop:flex-row desktop:gap-4 desktop:p-4 desktop:pt-0">
        <div className="flex min-h-0 flex-1 flex-col desktop:overflow-hidden desktop:rounded-2xl desktop:border desktop:border-border">
          {/* On a phone the header's margin is the gap above the score; inside the desktop card, the row's own padding. */}
          <div className="flex items-end justify-between gap-3 border-b border-border px-4 pb-2 desktop:pt-2">
            <Score value={village.score} label="Village score" size="sm" className="shrink-0" />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!own && (
                <Badge variant="outline">
                  <Icon name={from === "scout" ? "binoculars" : "user"} size="xs" />
                  {from === "scout" ? "Scouting" : "Visiting"}
                </Badge>
              )}
              <Badge variant="secondary" aria-label={`Level ${village.level}`}>
                Lv <span className="numeric">{village.level}</span>
              </Badge>
            </div>
          </div>
          {(renderBoard ?? ((props: VillageBoardProps) => <VillageBoard {...props} />))({
            village,
            fog,
            placing,
            over: drag?.over ?? null,
            tileArt,
            onPlace: (cell) => activePlan != null && activeIndex != null && place(activeIndex, activePlan, cell),
            className: "min-h-0 flex-1",
          })}
          {own && refusal && (
            <div className="border-t border-border px-4 py-2">
              <InlineError
                title="Not done"
                message={refusal}
                detail={refusalDetail}
                action={
                  onDismissRefusal && (
                    <Button size="sm" variant="ghost" onClick={onDismissRefusal}>
                      Dismiss
                    </Button>
                  )
                }
              />
            </div>
          )}
          {own && !founded && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <p className="text-sm text-muted-foreground">Found your village: these 9 cells and the starter tile are yours, free.</p>
              <Button className="shrink-0" loading={busy} onClick={onFound}>
                Found
              </Button>
            </div>
          )}
          {own && founded && rewardError && (
            <div className="border-t border-border px-4 py-2">
              <InlineError
                title="Your rewards could not be read"
                message={rewardError.message}
                detail={rewardError.detail}
                action={
                  onRetry && (
                    <Button size="sm" variant="outline" onClick={onRetry}>
                      Retry
                    </Button>
                  )
                }
              />
            </div>
          )}
          {own && founded && !rewardError && !offer && pending > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <p className="text-sm">
                <span className="numeric font-semibold">{pending}</span> {pending === 1 ? "reward waits" : "rewards wait"}: open one to draw its three tiles.
              </p>
              <Button className="shrink-0" loading={busy} onClick={onOpenReward}>
                <Icon name="gift" size="sm" /> Open
              </Button>
            </div>
          )}
          {own && founded && !rewardError && !offer && pending === 0 && (
            <p className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">No reward waits: win stars in PvP to earn one.</p>
          )}
          {!own && (
            <p className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
              {founded ? "Read-only: the tiles stay as their owner placed them." : "Not founded yet: the start every village gets."}
            </p>
          )}
        </div>
        {offer && (
          <RewardSheet
            offer={offer}
            village={village}
            selected={selected}
            orientation={orientation}
            dragging={drag?.index ?? null}
            busy={busy}
            tileArt={tileArt}
            onSelect={select}
            onRotate={() => setOrientation((o) => (o % 4) + 1)}
            onTakeCobbles={onTakeCobbles}
            onDragStart={startDrag}
            className="shrink-0 desktop:w-96 desktop:self-start"
          />
        )}
      </div>
      {drag && offer && (
        <span aria-hidden className="pointer-events-none fixed z-50 size-16 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg" style={{ left: drag.x, top: drag.y }}>
          <TileChip plan={offer.plans[drag.index] ?? 0} orientation={orientation} art={tileArt} className={cn("size-full border-primary", drag.over && "opacity-60")} />
        </span>
      )}
    </div>
  );
}
