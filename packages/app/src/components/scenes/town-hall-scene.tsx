import { Suspense, lazy, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { ARROW, Arrow } from "../elements/arrow";
import { Cobbles } from "../elements/cobbles";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LevelStar } from "../elements/level-star";
import { Notice } from "../elements/notice";
import { SectionTitle } from "../elements/section-title";
import { BalancesSlot } from "../containers/balances-context";
import type { ShownBalance } from "../containers/balances";
import { DrawerFooter, HudDrawer } from "../containers/hud-drawer";

/** Where the page stands before the Town Hall is shown: the village on its way, or a read that failed (with Retry). */
export type TownHallStatus = { kind: "loading" } | { kind: "error"; message: string; detail?: ErrorDetail };

/** A Town Hall level of the rule: the tiles a village holds round it, and what the upgrade to it asks (nothing at level 1). */
export interface TownHallLevel {
  level: number;
  /** The tiles the village holds at this level, the Town Hall not counted. */
  tiles: number;
  /** The Cobbles of the upgrade to this level; 0 at level 1, the foundation. */
  price: number;
  /** The player level the upgrade to this level asks for. */
  playerLevel: number;
}

/** The player's Town Hall, as read with the village. */
export interface TownHallHeld {
  /** Its level, 1 to the last of `levels`. */
  level: number;
  /** The player's level. */
  playerLevel: number;
  /** The Cobbles held; null while they are not read. */
  cobbles: number | null;
}

export interface TownHallSceneProps {
  status?: TownHallStatus | null;
  /** The player's Town Hall; null while `status` says why not, or where no Town Hall is served. */
  hall: TownHallHeld | null;
  /** Every level of the rule, the first to the last. */
  levels: readonly TownHallLevel[];
  /** The upgrade is on its way. */
  busy?: boolean;
  /** The last upgrade's refusal, in words. */
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  /** Where the renderer finds the models: the Town Hall in 3D; omitted, its level alone. */
  basePath?: string;
  /** The drawer is open (its route the current one); omitted, open. */
  open?: boolean;
  /** Where the focus goes back on close: the village. */
  returnFocus?: () => HTMLElement | null;
  onUpgrade?: () => void;
  onDismissRefusal?: () => void;
  onRetry?: () => void;
  /** The Cobbles' packs, where the price is short. */
  onGetCobbles?: () => void;
  /** The drawer's close, back to the village. */
  onBack?: () => void;
}

/** The line under the drawer's title. */
const INTRO = "Upgrade it to hold more tiles.";
/** The balance at the header's end: the Cobbles an upgrade costs. */
const BALANCES: readonly ShownBalance[] = ["cobbles"];

const tilesWord = (n: number) => `${formatInteger(n)} ${n === 1 ? "tile" : "tiles"}`;

/** The stage's edges fade to nothing, an arrow's width at the sides: inline, an arbitrary value costs the stylesheet's budget. */
const FADE = "linear-gradient(to right, transparent, black 14%, black 86%, transparent), linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)";
const STAGE_FADE: CSSProperties = { maskImage: FADE, maskComposite: "intersect", WebkitMaskImage: FADE, WebkitMaskComposite: "source-in" };

/** A press on a dialog over the drawer (the Cobbles' packs) is no tap on the village. */
const keepForDialogs = (event: Event) => {
  if ((event.target as Element | null)?.closest?.("[role=dialog], [role=alertdialog]")) event.preventDefault();
};

/** The Town Hall in 3D (`TownHallShowcase`, the Tiles page's chunk): the renderer comes with it, after the page. */
const TownHallShowcase = lazy(() => import("../containers/tile-showcase").then((mod) => ({ default: mod.TownHallShowcase })));

/** What a level asks, and whether the player has it. */
interface Requirement {
  key: string;
  label: ReactNode;
  /** In words, for the row's name. */
  name: string;
  met: boolean;
  /** The way to what is short, at the row's end (the Cobbles' packs). */
  hint?: ReactNode;
}

/** A requirement's row: a check once met, a lock until then, never by colour alone. */
function RequirementRow({ row, owned }: { row: Requirement; owned: boolean }) {
  return (
    <li data-met={row.met} aria-label={`${row.name}: ${row.met ? "met" : "not met"}`} className="flex min-h-11 items-center gap-3 border-b border-border/40 py-2 last:border-b-0">
      <Icon name={row.met ? "check" : "lock"} size="sm" fixedWidth className={cn("shrink-0", row.met ? "text-success" : "text-muted-foreground")} />
      <span className={cn("flex min-w-0 flex-1 items-center gap-x-2 text-sm font-semibold whitespace-nowrap", owned && "text-muted-foreground")}>{row.label}</span>
      {/* One line a requirement, met or not: its state is the icon's alone. */}
      {row.hint && <span className="shrink-0 text-sm whitespace-nowrap text-muted-foreground">{row.hint}</span>}
    </li>
  );
}

/**
 * The Town Hall (`/town-hall`, TOWN-HALL-PAGE, in place of the upgrade's dialog): the HUD's drawer, opened by a tap on the Town Hall
 * of one's own village, docked at the right from `tablet`, the Cobbles at its header's end. The Town Hall itself at the top, drawn in
 * 3D as the Tiles page's tile is (turned with the finger), an arrow on each side as the leagues' carousel: they go from a level to
 * the next, the next upgrade first in view. Under it the level in view, the tiles a village holds round it, and what it asks (the
 * level before it, the player's level, the Cobbles), each checked once the player has it. The upgrade is the footer's gold action:
 * off with "Owned" for a level the player has, off while a requirement is short, on for the next level once all are met. The village
 * on its way shows the page's shape, a failed read has Retry, a refusal is the app's error with Dismiss.
 */
export function TownHallScene(props: TownHallSceneProps) {
  const { status, hall, levels, busy = false, basePath } = props;
  // The level in view: the next one, the upgrade the player is after (the last level once reached), until an arrow moves it; after an
  // upgrade, the one after it.
  const [picked, setPicked] = useState<{ from: number; level: number } | null>(null);
  const mine = hall?.level ?? 1;
  const first = levels[0]?.level ?? 1;
  const last = levels[levels.length - 1]?.level ?? 1;
  const shown = picked && picked.from === mine ? picked.level : Math.min(mine + 1, last);
  const row = hall ? (levels.find((l) => l.level === shown) ?? null) : null;
  const step = (by: number) => setPicked({ from: mine, level: Math.max(first, Math.min(last, shown + by)) });

  const owned = hall !== null && shown <= mine;
  const requirements: Requirement[] = [];
  if (hall && row) {
    // The first level asks what the others do, in the same three rows: a village founded where they ask the level before.
    const before = shown > first ? `Town Hall level ${shown - 1}` : "Village founded";
    requirements.push({ key: "hall", name: before, label: before, met: mine >= shown - 1 });
    const level = owned || hall.playerLevel >= row.playerLevel;
    requirements.push({
      key: "level",
      name: `Player level ${row.playerLevel}`,
      label: (
        <>
          Player level <LevelStar level={row.playerLevel} size="sm" />
        </>
      ),
      met: level,
    });
    const cobbles = owned || hall.cobbles === null || hall.cobbles >= row.price;
    requirements.push({
      key: "cobbles",
      name: `${formatInteger(row.price)} ${row.price === 1 ? "Cobble" : "Cobbles"}`,
      label: <Cobbles value={row.price} />,
      met: cobbles,
      hint:
        !cobbles && props.onGetCobbles && shown === mine + 1 ? (
          <Button size="sm" variant="outline" onClick={props.onGetCobbles}>
            Get Cobbles
          </Button>
        ) : undefined,
    });
  }
  const open = !owned && requirements.every((r) => r.met);

  let body: ReactNode;
  if (status?.kind === "error") {
    body = <InlineError title="The Town Hall cannot be read" message={status.message} detail={status.detail} action={<Button size="sm" onClick={props.onRetry}>Retry</Button>} />;
  } else if (status?.kind === "loading") {
    body = (
      <div role="status" aria-label="Reading the Town Hall" className="flex flex-col items-center gap-3">
        <Skeleton className="aspect-[4/3] w-3/5 max-w-48 rounded-2xl" />
        <Skeleton className="h-9 w-40 rounded-lg" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    );
  } else if (!hall || !row) {
    body = (
      <Notice tone="warning" title="No Town Hall here yet">
        This network has no Town Hall to upgrade yet. Your village keeps its tiles.
      </Notice>
    );
  } else {
    // Without the 3D view (no WebGL, its chunk on its way): the level, on the drawer's carved face.
    const still = (
      <span aria-hidden className="absolute inset-0 flex items-center justify-center">
        <span className="drawer-carved text-outline flex aspect-square w-1/2 items-center justify-center rounded-2xl font-display text-5xl">{shown}</span>
      </span>
    );
    const onKey = (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "PageUp" && event.key !== "PageDown") return;
      event.preventDefault();
      step(event.key === "PageUp" ? -1 : 1);
    };
    body = (
      <>
        <InlineError
          title="Upgrade refused"
          message={props.refusal}
          detail={props.refusalDetail}
          action={
            <Button size="sm" variant="outline" onClick={props.onDismissRefusal}>
              Dismiss
            </Button>
          }
        />
        <section aria-label="Town Hall level" onKeyDown={onKey} className="flex flex-col items-center">
          {/* The arrows at the body's edges, as the leagues' carousel's; the stage the whole width under them, its edges faded out so
              the hall's corners never cover an arrow, the header or the text under it. */}
          <div className="relative -my-2 w-full">
            <div data-slot="town-hall-stage" data-level={shown} style={STAGE_FADE} className="relative mx-auto aspect-[5/4] w-full max-w-96">
              <Suspense fallback={<span role="img" aria-label={`Town Hall, level ${shown}`} className="absolute inset-0">{still}</span>}>
                <TownHallShowcase level={shown} basePath={basePath} still={still} placeholder={still} className="absolute inset-0" />
              </Suspense>
            </div>
            {/* The player's own level: a badge in the stage's top left corner, so the level's name keeps its place from one to the next. */}
            {shown === mine && <Badge className="absolute top-3 left-0">Yours</Badge>}
            <Button variant="ghost" size="icon" className={cn(ARROW, "absolute top-1/2 left-0 -translate-y-1/2")} aria-label="Previous level" disabled={shown === first} onClick={() => step(-1)}>
              <Arrow to="left" />
            </Button>
            <Button variant="ghost" size="icon" className={cn(ARROW, "absolute top-1/2 right-0 -translate-y-1/2")} aria-label="Next level" disabled={shown === last} onClick={() => step(1)}>
              <Arrow to="right" />
            </Button>
          </div>
          <p aria-live="polite" className="text-outline font-display text-3xl leading-tight">
            Level {shown}
          </p>
          <p className="text-center text-sm text-muted-foreground">
            A village holds <span className="font-semibold text-foreground">{tilesWord(row.tiles)}</span> round it.
          </p>
        </section>
        <section aria-labelledby="town-hall-asks" className="flex flex-col gap-3">
          <SectionTitle id="town-hall-asks">Requirements</SectionTitle>
          <ul aria-labelledby="town-hall-asks" data-slot="town-hall-asks" className="drawer-carved flex flex-col rounded-2xl px-4 py-1">
            {requirements.map((r) => (
              <RequirementRow key={r.key} row={r} owned={owned} />
            ))}
          </ul>
        </section>
      </>
    );
  }

  const off = !open || shown !== mine + 1 || busy || !props.onUpgrade;
  return (
    <HudDrawer
      open={props.open ?? true}
      onOpenChange={(to) => {
        if (!to) props.onBack?.();
      }}
      title="Town Hall"
      subtitle={INTRO}
      side="right"
      slot="town-hall"
      returnFocus={props.returnFocus}
      end={<BalancesSlot layout="pill" kinds={BALANCES} direction="column" />}
      onInteractOutside={keepForDialogs}
    >
      {body}
      {!status && hall && row && (
        <DrawerFooter>
          <div data-slot="town-hall-footer" className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
            {!owned && (
              <span role="group" aria-label="Price" className="flex min-w-0 flex-col">
                <span className="text-sm leading-tight font-semibold text-muted-foreground">Level {shown} for</span>
                <Cobbles value={row.price} className="text-outline text-lg font-bold" />
              </span>
            )}
            <Button
              variant="ghost"
              // The drawers' gold action (the Vault's), its light passing while it can be pressed.
              style={GOLD_ACTION}
              className="relative ml-auto h-12 min-w-36 shrink-0 px-1 text-lg font-black text-foreground mobile:text-xl"
              aria-label={owned ? `Level ${shown} owned` : `Upgrade to level ${shown} for ${formatInteger(row.price)} ${row.price === 1 ? "Cobble" : "Cobbles"}`}
              onClick={off ? undefined : props.onUpgrade}
              disabled={off}
              loading={busy && !owned}
            >
              {!off && <GoldShine />}
              {owned ? "Owned" : "Upgrade"}
            </Button>
          </div>
        </DrawerFooter>
      )}
    </HudDrawer>
  );
}
