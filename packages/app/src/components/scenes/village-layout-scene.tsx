import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardTile } from "@paved/chain";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Cobbles } from "../elements/cobbles";
import { HoldButton } from "../elements/hold-button";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { Score } from "../elements/score";
import { type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { InventoryTray } from "../containers/inventory-tray";
import { LayoutBoard, type LayoutPending } from "../containers/layout-board";
import { STARTER, canLift, fittingAt, layoutScore, legalSpots, placeTile, sameLayout, slotsFor, trayOf, type Inventory, type Spot, type VillageLayout } from "../containers/layout-rules";
import { SkinsStatusView, type SkinsStatus } from "../containers/skins-status";
import { TileBubble } from "../containers/tile-bubble";
import { TopBar } from "../containers/top-bar";

/** Why the village is not shown: a guest (Connect), the reads on their way, a failed read (Retry). */
export type VillageLayoutStatus = SkinsStatus;

/** A layout saved: the score it gives, against the one before. */
export interface LayoutSaved {
  score: number;
  previous: number;
}

/** The tile in hand: from the inventory (a plan), or lifted from the board (the tile, its cell and rotation kept). */
export type LayoutHand = { from: "inventory"; plan: number } | { from: "board"; tile: BoardTile };

export interface VillageLayoutSceneProps {
  /** The village; omitted, `status` says why. */
  village?: VillageLayout;
  status?: VillageLayoutStatus | null;
  /** The collected tiles off the saved layout, per plan (own village). */
  inventory?: Inventory;
  /** The player's own village (edit, chests, shop), or someone else's, read-only. */
  mode?: "own" | "visit";
  /** The own village is founded; false: the starter alone, and Found (its starter layout comes with it). */
  founded?: boolean;
  /** The founding on its way. */
  founding?: boolean;
  /** The player's Cobbles (own village). */
  cobbles?: number;
  /** The chests waiting to be opened (own village): a count on Chests. */
  chests?: number;
  /** The save on its way: the editor waits. */
  saving?: boolean;
  /** The last save landed: the new score, until dismissed. The editor closes. */
  saved?: LayoutSaved | null;
  /** The save's refusal, until dismissed. */
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  tileArt?: TileArt;
  /** The hold's length on the bubble and Reset all, ms (the stories and tests tune it). */
  holdMs?: number;
  /** Where the stories start: the editor open on this draft (the saved layout when unset), a tile in hand, set on a cell, the leave dialog. */
  initialEditing?: boolean;
  initialDraft?: readonly BoardTile[];
  initialHand?: { plan: number } | { lift: number } | null;
  initialPending?: Spot | null;
  initialLeaving?: boolean;
  onBack?: () => void;
  onConnect?: () => void;
  onRetry?: () => void;
  /** Save the draft: always valid (the editor keeps it so), within the slots. */
  onSave?: (tiles: readonly BoardTile[]) => void;
  /** Found the village (own, not founded). */
  onFound?: () => void;
  /** The editor holds changes not saved (true), or none (false): the page asks before leaving it by any other way than Back. */
  onDirtyChange?: (dirty: boolean) => void;
  onDismissSaved?: () => void;
  onDismissRefusal?: () => void;
  onOpenChests?: () => void;
  onOpenShop?: () => void;
}

/**
 * The v2 village (#739, part of #732): a free layout of the player's collected tiles, rearranged at any time, capped by the
 * slots unlocked (8 + level). The view shows the layout under the fog, which lifts around its tiles, the score, the level
 * and the slots used ("21 / 28"), and leads to the chests and the shop. Edit opens the editor, where placing works as on the
 * board (the owner's decisions): a card of the inventory's carousel puts its tile in hand, its legal cells light up, a tap
 * sets it on one, and the bubble rotates it, sends it back to the inventory (in the bin's place) or places it with a hold. A
 * placed tile is lifted into the hand with a tap, to move, turn or send back; a tile that holds the village together shakes
 * instead. The starter never moves. "Reset all", held, brings the village back to the starter alone. The layout stays valid at
 * every step; its live score is the engine's. Save sends it when something changed and shows the new score once confirmed;
 * Discard changes goes back to the saved layout, and leaving with changes asks first. Data and the save come as props and
 * callbacks: the page wires them to the mock ledger (#741) and then the contracts (#733) in later tasks.
 */
export function VillageLayoutScene({ village, status, mode = "own", onBack, onConnect, onRetry, ...props }: VillageLayoutSceneProps) {
  if (village) return <LayoutView village={village} mode={mode} onBack={onBack} {...props} />;
  const own = mode === "own";
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar title={own ? "My village" : "Village"} onBack={onBack} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-4">
        {status && (
          <SkinsStatusView
            status={status}
            guestTitle="Connect to build your village"
            guestText="Your village is kept on your account: chests after your games and the daily shop fill your inventory, and others attack it."
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
        )}
      </main>
    </div>
  );
}

/** The orientation the tile takes on `spot`: the one it has if it fits there, else the first that does. */
const fitOn = (spot: Spot, orientation: number) => (spot.orientations.includes(orientation) ? orientation : spot.orientations[0]!);

function LayoutView({
  village,
  mode = "own",
  inventory = {},
  founded = true,
  founding = false,
  cobbles = 0,
  chests = 0,
  saving = false,
  saved = null,
  refusal = null,
  refusalDetail,
  tileArt,
  holdMs,
  initialEditing = false,
  initialDraft,
  initialHand = null,
  initialPending = null,
  initialLeaving = false,
  onBack,
  onSave,
  onFound,
  onDirtyChange,
  onDismissSaved,
  onDismissRefusal,
  onOpenChests,
  onOpenShop,
}: Omit<VillageLayoutSceneProps, "village" | "status" | "onConnect" | "onRetry"> & { village: VillageLayout }) {
  const own = mode === "own";
  const slots = slotsFor(village.level);
  const start = initialDraft ?? village.tiles;
  const startHand: LayoutHand | null = !initialHand
    ? null
    : "plan" in initialHand
      ? { from: "inventory", plan: initialHand.plan }
      : (() => {
          const tile = start.find((t) => t.id === initialHand.lift);
          return tile ? { from: "board", tile } : null;
        })();
  const [editing, setEditing] = useState(own && initialEditing);
  const [draft, setDraft] = useState<readonly BoardTile[]>(startHand?.from === "board" ? start.filter((t) => t.id !== startHand.tile.id) : start);
  const [hand, setHand] = useState<LayoutHand | null>(startHand);
  const [pending, setPending] = useState<LayoutPending | null>(() => {
    if (startHand?.from === "board") return { ...startHand.tile };
    if (startHand && initialPending) return { x: initialPending.x, y: initialPending.y, plan: startHand.plan, orientation: initialPending.orientations[0]! };
    return null;
  });
  const [shaking, setShaking] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(initialLeaving);
  const shake = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (shake.current && clearTimeout(shake.current)), []);

  // A save that landed closes the editor on the new layout.
  useEffect(() => {
    if (!saved) return;
    setEditing(false);
    setHand(null);
    setPending(null);
  }, [saved]);
  // The saved layout changed (a save, a read): a closed editor follows it.
  useEffect(() => {
    if (!editing) setDraft(village.tiles);
  }, [village.tiles, editing]);

  const lifted = hand?.from === "board" ? hand.tile : null;
  // The layout as it stands: the draft, the lifted tile back at its cell until it goes elsewhere.
  const whole = useMemo(() => (lifted ? [...draft, lifted] : draft), [draft, lifted]);
  const tiles = editing ? draft : village.tiles;
  // A lifted tile still takes its slot: it is in hand, not in the inventory.
  const used = editing ? whole.length : village.tiles.length;
  const full = used >= slots;
  const over = used > slots;
  const tray = trayOf(inventory, village.tiles, whole);
  const handPlan = hand ? (hand.from === "inventory" ? hand.plan : hand.tile.plan) : null;
  const plates = useMemo(() => (editing && handPlan != null ? legalSpots(draft, handPlan) : []), [editing, handPlan, draft]);
  const score = useMemo(() => (editing ? layoutScore(whole) : village.score), [editing, whole, village.score]);
  const changed = !sameLayout(whole, village.tiles);
  const dirty = editing && changed;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const open = () => {
    onDismissSaved?.();
    setDraft(village.tiles);
    setHand(null);
    setPending(null);
    setEditing(true);
  };
  /** The tile in hand put down: a lifted tile back where it was, an inventory tile back in the inventory. */
  const putBack = () => {
    if (lifted) setDraft((d) => [...d, lifted]);
    setHand(null);
    setPending(null);
  };
  const close = () => {
    setDraft(village.tiles);
    setHand(null);
    setPending(null);
    setLeaving(false);
    setEditing(false);
  };
  const back = () => {
    if (!editing) return onBack?.();
    if (changed) setLeaving(true);
    else close();
  };

  const choosePlan = (plan: number | null) => {
    if (saving) return;
    // Every slot used: no inventory tile comes into the hand (the lifted one, if any, stays in hand).
    if (plan != null && full) return;
    if (lifted) setDraft((d) => [...d, lifted]);
    setHand(plan == null ? null : { from: "inventory", plan });
    setPending(null);
  };
  const choosePlate = (spot: Spot) => {
    if (handPlan == null || saving) return;
    setPending((p) => ({ x: spot.x, y: spot.y, plan: handPlan, orientation: fitOn(spot, p?.orientation ?? (lifted?.orientation ?? 1)) }));
  };
  const lift = (tile: BoardTile) => {
    if (saving) return;
    // What is in hand goes back first: one tile in hand at a time.
    const base = lifted ? [...draft, lifted] : draft;
    if (!canLift(base, tile.id)) {
      setShaking(tile.id);
      if (shake.current) clearTimeout(shake.current);
      shake.current = setTimeout(() => setShaking(null), 1_600);
      setDraft(base);
      setHand(null);
      setPending(null);
      return;
    }
    setShaking(null);
    setDraft(base.filter((t) => t.id !== tile.id));
    setHand({ from: "board", tile });
    setPending({ ...tile });
  };
  const rotations = pending ? fittingAt(draft, pending.plan, pending) : [];
  const rotate = () => {
    if (!pending || rotations.length < 2) return;
    const i = rotations.indexOf(pending.orientation);
    setPending({ ...pending, orientation: rotations[(i + 1) % rotations.length]! });
  };
  const confirm = () => {
    if (!pending || !hand) return;
    if (hand.from === "board") {
      setDraft((d) => [...d, { ...hand.tile, x: pending.x, y: pending.y, orientation: pending.orientation }]);
      setHand(null);
    } else {
      // Never past the slots: an inventory tile needs a free one (the editor never places more than S tiles).
      if (whole.length >= slots) return;
      setDraft((d) => placeTile(d, hand.plan, pending.orientation, pending));
      // The plan stays in hand while some are left and a slot is free: several of one plan go down in a row.
      if ((tray[hand.plan] ?? 0) <= 1 || used + 1 >= slots) setHand(null);
    }
    setPending(null);
  };
  const sendBack = () => {
    setHand(null);
    setPending(null);
  };
  const reset = () => {
    setDraft([{ ...STARTER }]);
    setHand(null);
    setPending(null);
  };
  const discard = () => {
    setDraft(village.tiles);
    setHand(null);
    setPending(null);
  };

  const hint =
    shaking != null
      ? "This tile holds the village together: take the outer tiles first."
      : pending
        ? "Rotate, then hold the check to place it."
        : hand
          ? plates.length
            ? `Tap a lit cell for ${tileName(handPlan!)}.`
            : `${tileName(handPlan!)} fits nowhere yet: send it back, or place another tile first.`
          : full
            ? "Every slot is used: lift a tile to move it, or send it back to free one."
            : "Choose a tile in the inventory, or tap a placed tile to lift it.";

  const title = own ? "My village" : `${village.owner}'s village`;
  return (
    <div className="flex min-h-dvh flex-col bg-background desktop:h-dvh desktop:overflow-hidden">
      <TopBar
        title={editing ? "Edit layout" : title}
        onBack={back}
        ownCobbles={own}
        end={
          own ? (
            <span className="pr-2">
              <Cobbles value={cobbles} />
            </span>
          ) : undefined
        }
      />
      <div className="flex min-h-0 flex-1 flex-col desktop:flex-row desktop:gap-4 desktop:p-4 desktop:pt-0">
        <div className="flex min-h-0 flex-1 flex-col desktop:overflow-hidden desktop:rounded-2xl desktop:border desktop:border-border">
          <div className="flex items-end justify-between gap-3 border-b border-border px-4 pb-2 desktop:pt-2">
            <div className="flex shrink-0 items-end gap-3">
              <Score value={score} label={editing ? "Layout score" : "Village score"} size="sm" />
              {editing && score !== village.score && (
                <span className="pb-0.5 text-xs text-muted-foreground">
                  saved <span className="numeric">{formatInteger(village.score)}</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!own && (
                <Badge variant="outline">
                  <Icon name="user" size="xs" /> Visiting
                </Badge>
              )}
              <Badge variant="secondary" aria-label={`Level ${village.level}`}>
                Lv <span className="numeric">{village.level}</span>
              </Badge>
              <Badge variant="secondary" aria-label={`${used} of ${slots} slots used`}>
                <Icon name="table-cells-large" size="xs" />
                <span className="numeric">
                  {used} / {slots}
                </span>
              </Badge>
            </div>
          </div>
          <LayoutBoard
            tiles={tiles}
            editing={editing}
            plates={plates}
            pending={editing ? pending : null}
            shaking={shaking}
            tileArt={tileArt}
            onTile={lift}
            onPlate={choosePlate}
            // On a phone the board takes what the header and the editor leave (the page scrolls only on a short screen); from
            // desktop it fills its card.
            className={cn("flex-none desktop:min-h-0 desktop:flex-1", editing ? "h-[max(14rem,calc(100dvh-30rem))]" : "h-[max(14rem,calc(100dvh-14rem))]", "desktop:h-auto")}
          />
          {own && saved && !editing && (
            <div className="border-t border-border px-4 py-2">
              <Notice icon="circle-check" title="Layout saved">
                Your village scores <span className="numeric font-semibold">{formatInteger(saved.score)}</span>
                {saved.score !== saved.previous && (
                  <span className={cn("numeric", saved.score > saved.previous ? "text-success" : "text-muted-foreground")}>
                    {" "}
                    ({saved.score > saved.previous ? "+" : "−"}
                    {formatInteger(Math.abs(saved.score - saved.previous))})
                  </span>
                )}
                : attackers play against it now.
              </Notice>
            </div>
          )}
          {own && refusal && (
            <div className="border-t border-border px-4 py-2">
              <InlineError
                title="Not saved"
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
          {!own && <p className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">Read-only: the tiles stay as their owner laid them out.</p>}
          {own && !editing && !founded && (
            <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] desktop:hidden">
              <FoundNotice founding={founding} onFound={onFound} />
            </div>
          )}
          {own && !editing && founded && (
            <div className="grid grid-cols-3 gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] desktop:hidden">
              <ViewActions chests={chests} onEdit={open} onOpenChests={onOpenChests} onOpenShop={onOpenShop} />
            </div>
          )}
        </div>
        {own && (
          <aside
            aria-label={editing ? "Editor" : "Village"}
            className={cn(
              "flex shrink-0 flex-col gap-3 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] desktop:w-96 desktop:self-start desktop:rounded-2xl desktop:border desktop:p-4",
              !editing && "hidden desktop:flex",
            )}
          >
            {editing ? (
              <>
                {pending && hand && (
                  <TileBubble
                    rotations={rotations.length}
                    orientation={pending.orientation}
                    cell={pending}
                    holdMs={holdMs}
                    busy={saving}
                    onRotate={rotate}
                    onClose={putBack}
                    onReturn={sendBack}
                    onConfirm={confirm}
                    canConfirm={hand.from === "board" || whole.length < slots}
                  />
                )}
                <p role="status" aria-live="polite" className={cn("px-1 text-xs", shaking != null ? "text-warning" : "text-muted-foreground")}>
                  {hint}
                </p>
                <InventoryTray tray={tray} held={hand?.from === "inventory" ? hand.plan : null} full={full} busy={saving} tileArt={tileArt} onSelect={choosePlan} />
                <div className="flex items-center gap-2">
                  <HoldButton label="Hold to reset all: the starter alone, every tile back in the inventory" title="Hold to reset all" icon="rotate" tone="destructive" holdMs={holdMs} disabled={saving || draft.length <= 1} onComplete={reset} />
                  <Button variant="outline" className="flex-1" onClick={discard} disabled={!changed || saving} aria-label="Discard changes">
                    Discard
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => {
                      // What is in hand stays where it is: a lifted tile at its cell, an inventory tile in the inventory.
                      if (over) return;
                      putBack();
                      onSave?.(whole);
                    }}
                    disabled={!changed || over || saving}
                    loading={saving}
                  >
                    <Icon name="check" size="sm" /> Save
                  </Button>
                </div>
              </>
            ) : !founded ? (
              <FoundNotice founding={founding} onFound={onFound} />
            ) : (
              <>
                <h2 className="font-display text-lg">Your village</h2>
                <p className="text-sm text-muted-foreground">
                  <span className="numeric">{used}</span> of your <span className="numeric">{slots}</span> slots hold a tile; each level unlocks one more, up to 28.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <ViewActions chests={chests} onEdit={open} onOpenChests={onOpenChests} onOpenShop={onOpenShop} />
                </div>
              </>
            )}
          </aside>
        )}
      </div>
      <Dialog open={leaving} onOpenChange={setLeaving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogDescription>Your changes to the layout are lost; the village stays as it was saved.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaving(false)}>
              Keep editing
            </Button>
            <Button variant="destructive" onClick={close}>
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A village not founded yet: Found lays out its starter layout (8 tiles around the starter, picked by the address). */
function FoundNotice({ founding, onFound }: { founding: boolean; onFound?: () => void }) {
  return (
    <Notice
      icon="house"
      title="Found your village"
      action={
        <Button size="sm" loading={founding} onClick={onFound}>
          Found
        </Button>
      }
    >
      It is free: 8 tiles laid out around the starter come with it, and chests and the daily shop add more.
    </Notice>
  );
}

/** The view's three ways on: edit the layout, open the chests (their count), the shop. */
function ViewActions({ chests, onEdit, onOpenChests, onOpenShop }: { chests: number; onEdit: () => void; onOpenChests?: () => void; onOpenShop?: () => void }) {
  return (
    <>
      <Button onClick={onEdit}>Edit</Button>
      <Button variant="outline" onClick={onOpenChests} aria-label={chests > 0 ? `Chests, ${chests} waiting` : "Chests"} className="relative">
        <Icon name="gift" size="sm" /> Chests
        {chests > 0 && (
          <span aria-hidden className="numeric absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
            {chests}
          </span>
        )}
      </Button>
      <Button variant="outline" onClick={onOpenShop}>
        Shop
      </Button>
    </>
  );
}
