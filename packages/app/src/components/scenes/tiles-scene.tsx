import { Suspense, lazy, useRef, useState, type ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import { formatNumber } from "@paved/game-core";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { SectionTitle } from "../elements/section-title";
import { tileFeatures } from "../elements/tile-features";
import { TILE_CUT } from "../elements/tile-cut";
import { TileRender, tileName, type TileRenders } from "../elements/tile-render";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { BalancesSlot } from "../containers/balances-context";
import { PLANS, applySkinChanges, ownsSkin } from "../containers/cobble-types";
import { HudDrawer } from "../containers/hud-drawer";
import { SkinsStatusView, type SkinsStatus } from "../containers/skins-status";
import { THEMES, THEME_CODES, type SkinThemeId, type ThemeOption } from "../containers/theme-card";
import type { OwnedSkins } from "./theme-scene";

/** The Tiles page's skins: the player's (`useOwnedSkins`), the batch not saved yet, and what is on its way. */
export interface TilesSkins extends OwnedSkins {
  /** The picks changed since: plan to theme id, saved in one `set_skins` write. */
  changes: Readonly<Record<number, number>>;
  /** `set_skins`: on its way, or just done. */
  save?: "idle" | "saving" | "saved";
  /** The last write refused or failed: shown until dismissed or the next write. */
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
}

export interface TilesSceneProps {
  renders?: TileRenders;
  /** The player's skins; omitted: `skinsStatus` says why. */
  skins?: TilesSkins | null;
  skinsStatus?: SkinsStatus | null;
  /** The plan shown first (1 to 19); unset, the first. */
  initialPlan?: number;
  /** Where the renderer finds the models: the selected tile in 3D (`TileShowcase`); omitted, its image, which does not turn. */
  basePath?: string;
  onPick?: (plan: number, code: number) => void;
  onSave?: () => void;
  onDiscard?: () => void;
  onDismissRefusal?: () => void;
  /** A theme's shop: a skin not owned is bought there. */
  onOpenShop?: (theme: SkinThemeId) => void;
  onRetry?: () => void;
  onBack?: () => void;
  /** Whether the drawer is shown: its route is the current one; false while it slides out. Omitted, shown (a story's route). */
  open?: boolean;
  /** Where the focus goes back as the drawer closes (the right column's Tiles); omitted, Radix's own. */
  returnFocus?: () => HTMLElement | null;
}

/**
 * The 3D tile in its own chunk (the bundle rule): the renderer's code is the home's village's already, but naming it here would put its
 * chunks in the route map's preload list, the first load's. The tile's image while it comes.
 */
const TileShowcase = lazy(() => import("../containers/tile-showcase").then((mod) => ({ default: mod.TileShowcase })));

const ALL_PLANS = Array.from({ length: PLANS }, (_, i) => i + 1);

/** The gold of what is chosen (the book's wash, the profile's ring on the Hall of Fame's picked season). */
const CHOSEN = "bg-linear-to-b from-primary/40 to-primary/5 ring-2 ring-medal-1 ring-inset";

/** A section's count beside its title, as the Missions' ("Daily 1/5"). */
function Count({ done, of }: { done: number; of: number }) {
  return (
    <span className="numeric font-sans text-base font-bold text-muted-foreground">
      {done}/{of}
    </span>
  );
}

/**
 * Tiles (`/tiles`, COLLECTION-PAGE, after the Paved UX Book's Collection, renamed after the home's button), in the profile's and the
 * Missions' style: the HUD's drawer (a full page with Back on a phone, a side panel docked at the right from `tablet`, under the right
 * column's Tiles), the Cobbles at its header's end. The selected tile's name, the tile in 3D, turned with the finger (`TileStage`);
 * then its Skins (the drawer's section title, the skins owned of five) on one carved band, the book's row: Default and
 * the themes on sale (Active, Use, or locked with Shop), then those coming soon (Soon); then All tiles, the 19 seen from above in the skin
 * each wears, the selected one in gold. The picks are batched, then saved in one `set_skins` (Save), or dropped (Discard), as the skins were (P-61).
 */
export function TilesScene({ renders, skins, skinsStatus, initialPlan, basePath, onPick, onSave, onDiscard, onDismissRefusal, onOpenShop, onRetry, onBack, open, returnFocus }: TilesSceneProps) {
  const [plan, setPlan] = useState(initialPlan ?? 1);
  const reduced = useReducedMotionConfig() ?? false;
  const stage = useRef<HTMLElement>(null);
  // A tile picked low in the grid: the stage comes back into view, its name first (the drawer's body scrolls).
  const select = (p: number) => {
    setPlan(p);
    const el = stage.current;
    const body = el?.closest("[data-hud-drawer-body]");
    if (el && body && el.getBoundingClientRect().bottom - body.getBoundingClientRect().top < el.offsetHeight / 2) el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  };
  const saving = skins?.save === "saving";
  const current = skins ? applySkinChanges(skins.active, skins.changes) : [];
  const value = current[plan - 1] ?? 0;
  const saved = skins?.active[plan - 1] ?? 0;
  const name = tileName(plan);
  const ownsCode = (code: number) => code === 0 || ownsSkin(skins?.owned[code] ?? 0, plan);
  return (
    <HudDrawer
      open={open ?? true}
      onOpenChange={(next) => {
        if (!next) onBack?.();
      }}
      title="Tiles"
      side="right"
      slot="tiles"
      returnFocus={returnFocus}
      end={<BalancesSlot layout="pill" />}
    >
      {!skins ? (
        skinsStatus && (
          <SkinsStatusView
            status={skinsStatus}
            skeleton={<TilesSkeleton />}
            onRetry={onRetry}
          />
        )
      ) : (
        <>
          <section ref={stage} aria-label="Selected tile" className="flex scroll-mt-4 flex-col items-center">
            {/* The book's name over the stage, in the profile's name's weight (Rubik, black outline). */}
            <h2 className="text-outline text-2xl leading-tight font-bold">{name}</h2>
            <TileStage plan={plan} theme={value} renders={renders} basePath={basePath} />
          </section>
          <TileDescription plan={plan} />
          <InlineError
            title="Not done"
            message={skins.refusal}
            detail={skins.refusalDetail}
            action={
              onDismissRefusal && (
                <Button size="sm" variant="ghost" onClick={onDismissRefusal}>
                  Dismiss
                </Button>
              )
            }
          />
          <section aria-labelledby="tiles-skins" className="flex flex-col gap-2">
            <SectionTitle id="tiles-skins">
              Skins
              <Count done={THEMES.filter((t) => t.available && ownsCode(THEME_CODES[t.id])).length} of={THEMES.length} />
            </SectionTitle>
            {/* The spec's five in its order: Default and the themes on sale (Forest today), then those coming soon (Snow, Desert,
                Volcano: the owner's choice of 2026-11-05, the book's locked Snow), locked, no art yet: the tile under a blur. One carved
                band, the book's row, its cells parted by the drawer's rules; three a row on the narrowest phones. */}
            <ul aria-label={`${name}: skins`} className="drawer-carved drawer-rule grid grid-cols-3 rounded-xl p-1 mobile:grid-cols-5 max-mobile:[&>*:nth-child(3n+1)]:border-l-0">
              {THEMES.map((theme) => {
                const code = THEME_CODES[theme.id];
                const state: SkinState = !theme.available ? "soon" : value === code ? (saved === code ? "in-use" : "picked") : ownsCode(code) ? "owned" : "locked";
                return (
                  <SkinCell
                    key={theme.id}
                    plan={plan}
                    theme={theme}
                    renders={renders}
                    state={state}
                    disabled={saving}
                    onPress={() => (state === "owned" ? onPick?.(plan, code) : theme.id !== "default" && onOpenShop?.(theme.id))}
                  />
                );
              })}
            </ul>
          </section>
          <section aria-labelledby="tiles-all" className="flex flex-col gap-2">
            <SectionTitle id="tiles-all">All tiles</SectionTitle>
            {/* Each tile seen from above (the owner's ask of 2026-11-05: the grid top-down, the isometric view the stage's), four a row on
                a carved panel as the Hall of Fame's seasons, the selected one in the book's gold wash and the profile's gold ring. */}
            <ul aria-label="Tiles" className="drawer-carved grid grid-cols-4 gap-1 rounded-xl p-1">
              {ALL_PLANS.map((p) => {
                const unsaved = (current[p - 1] ?? 0) !== (skins.active[p - 1] ?? 0);
                return (
                  <li key={p}>
                    <button
                      type="button"
                      aria-pressed={p === plan}
                      aria-label={unsaved ? `${tileName(p)}, skin not saved` : tileName(p)}
                      onClick={() => select(p)}
                      className={cn("state-layer relative block aspect-square w-full cursor-pointer rounded-lg p-1.5", p === plan && CHOSEN)}
                    >
                      {/* The top-down render's edge is a pixel of its backdrop: scaled a little in its rounded box, it is cut. */}
                      <span className="block size-full overflow-hidden rounded-md shadow-[0_2px_0_var(--hud-outline)]">
                        <TileRender plan={p} theme={current[p - 1] ?? 0} renders={renders} top alt="" className="scale-105" />
                      </span>
                      {/* Where the book draws its count: a pick not saved yet (the Save bar's batch), the profile's gold. */}
                      {unsaved && <span aria-hidden data-slot="tile-unsaved" className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-medal-1 shadow-[0_0_0_2px_var(--hud-outline)]" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <SaveBar changes={Object.keys(skins.changes).length} save={skins.save ?? "idle"} onSave={onSave} onDiscard={onDiscard} />
        </>
      )}
    </HudDrawer>
  );
}

/**
 * The selected tile, drawn in 3D (`TileShowcase`) over the drawer's face: the owner's ask of 2026-11-05, the finger alone presents it
 * (a drag turns it and tilts the view, never from under it), no zoom, no arrows, no pedestal. Without the 3D view (no WebGL, a scene
 * that did not start) the tile's image.
 */
function TileStage({ plan, theme, renders, basePath }: { plan: number; theme: number; renders?: TileRenders; basePath?: string }) {
  const name = tileName(plan);
  // The tile's image while the 3D view's chunk and then its models come.
  const still = (
    <span aria-hidden className="absolute inset-0 flex items-center justify-center">
      <span className="block aspect-square w-3/5" style={TILE_CUT}>
        <TileRender plan={plan} theme={theme} renders={renders} alt="" />
      </span>
    </span>
  );
  return (
    <div className="relative aspect-[4/3] w-full max-w-80">
      <Suspense fallback={<span role="img" aria-label={name} className="absolute inset-0">{still}</span>}>
        <TileShowcase plan={plan} theme={theme} basePath={basePath} renders={renders} placeholder={still} className="absolute inset-0" />
      </Suspense>
    </div>
  );
}

/**
 * What the tile holds (the owner's ask of 2026-11-05, before its skins), in the profile's manner: the drawer's section title, one
 * sentence read from the plan (`tileFeatures`: its cities and how many sides each opens onto, its roads, its forests, a wonder or a
 * crossroads at its centre), then the profile's carved band of figures, the structures' painted icons beside their counts (the Stats'),
 * and its copies in the base deck. Nothing the plan does not say.
 */
function TileDescription({ plan }: { plan: number }) {
  const features = tileFeatures(plan);
  return (
    <section aria-labelledby="tiles-description" className="flex flex-col gap-2">
      <SectionTitle id="tiles-description">Description</SectionTitle>
      <p data-slot="tile-sentence" className="text-sm leading-snug font-semibold text-muted-foreground">
        {features.sentence}
      </p>
      <dl data-slot="tile-features" className="drawer-carved drawer-rule flex rounded-xl">
        <Feature art="city" term="Cities" value={features.cities} />
        <Feature art="road" term="Roads" value={features.roads} />
        <Feature art="forest" term="Forests" value={features.forests} />
        <Feature art="wonder" term="Wonders" value={features.wonders} />
        <Feature art="collection" term="In deck" value={features.deck} />
      </dl>
    </section>
  );
}

/** One figure of the band, as the profile's (`Figure`): its term over its value, the structure's icon beside the value. */
function Feature({ art, term, value }: { art: UiIconName; term: string; value: number }) {
  return (
    <div className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 px-0.5 py-2">
      <dt className="text-center text-xs leading-tight font-bold text-muted-foreground">{term}</dt>
      <dd className={cn("flex items-center gap-1", value === 0 && "opacity-50")}>
        <UiIcon name={art} px={20} className="drawer-icon size-5" />
        <span className="text-outline text-lg leading-tight font-bold tabular-nums">{formatNumber(value)}</span>
      </dd>
    </div>
  );
}

type SkinState = "in-use" | "picked" | "owned" | "locked" | "soon";

const STATE_TEXT: Record<SkinState, string> = { "in-use": "active", picked: "active, not saved", owned: "owned", locked: "not owned", soon: "coming soon" };

/**
 * A cell's word at its foot, four in all (the owner's ask of 2026-11-05): a raised pill that presses (Use, Shop), a carved chip that
 * informs (Active, Soon). A pick not saved yet reads Active too: its tile's gold dot and the Save bar say it waits.
 */
const PILL = "flex h-6 items-center rounded-full px-2.5 text-xs leading-none font-bold";

/**
 * One skin of the selected tile, a cell of the book's row: the tile in it seen from above, its name in the profile's tiles' weight
 * (bold, outlined), then what it is. Active: the book's gold wash and the profile's gold ring, a carved "Active"; owned: the whole cell
 * presses, a raised "Use"; on sale and not owned: the Missions' painted lock at the tile's corner, a raised "Shop" (the whole cell opens
 * the theme's shop); coming soon: the tile greyed under the lock, a carved "Soon", nothing to press.
 */
function SkinCell({ plan, theme, renders, state, disabled, onPress }: { plan: number; theme: ThemeOption; renders?: TileRenders; state: SkinState; disabled?: boolean; onPress: () => void }) {
  const chosen = state === "in-use" || state === "picked";
  const presses = state === "owned" || state === "locked";
  const body = (
    <>
      <span className="relative block aspect-square w-full max-w-14">
        {/* From above, as the grid (the owner's ask of 2026-11-05: the isometric view the stage's alone): the tile fills its square, so
            no backdrop shows round it. Coming soon: the tile greyed and dimmed, no art of the theme yet. */}
        <span className="block size-full overflow-hidden rounded-md shadow-[0_2px_0_var(--hud-outline)]">
          <TileRender plan={plan} theme={state === "soon" ? 0 : THEME_CODES[theme.id]} renders={renders} top alt="" className={cn("scale-105", state === "soon" && "brightness-50 grayscale")} />
        </span>
        {(state === "locked" || state === "soon") && (
          <span className="absolute -right-1.5 -bottom-1.5 size-6">
            <UiIcon name="lock" px={24} className="drawer-icon block size-full" />
          </span>
        )}
      </span>
      <span className="text-outline max-w-full truncate text-xs leading-tight font-bold">{theme.name}</span>
      {chosen && <span className={cn(PILL, "drawer-carved text-medal-1")}>Active</span>}
      {state === "owned" && <span className={cn(PILL, "drawer-raised text-outline")}>Use</span>}
      {state === "locked" && <span className={cn(PILL, "drawer-raised text-outline")}>Shop</span>}
      {state === "soon" && <span className={cn(PILL, "drawer-carved text-muted-foreground")}>Soon</span>}
    </>
  );
  const cell = cn("flex w-full flex-col items-center gap-1.5 rounded-lg px-0.5 pt-1.5 pb-2", chosen && CHOSEN);
  return (
    <li aria-label={`${theme.name}: ${STATE_TEXT[state]}`} data-state={state} className="flex px-0.5 py-0.5">
      {presses ? (
        <button
          type="button"
          aria-label={state === "owned" ? `Use ${theme.name}` : `Shop ${theme.name}`}
          disabled={disabled}
          onClick={onPress}
          className={cn(cell, "state-layer cursor-pointer disabled:cursor-default disabled:opacity-50")}
        >
          {body}
        </button>
      ) : (
        <div className={cell}>{body}</div>
      )}
    </li>
  );
}

/** The page's place while the skins load: its title, the tile, the skins' band and the grid, carved (the face's own grey would hide them). */
function TilesSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3">
      <Skeleton className="h-7 w-28 bg-card" />
      <Skeleton className="aspect-[4/3] w-3/5 max-w-48 rounded-2xl bg-card" />
      <Skeleton className="h-10 w-full rounded-md bg-card" />
      <Skeleton className="h-16 w-full rounded-xl bg-card" />
      <Skeleton className="h-32 w-full rounded-xl bg-card" />
      <div className="grid w-full grid-cols-4 gap-1">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg bg-card" />
        ))}
      </div>
    </div>
  );
}

/** The batch of picks: how many changed, Save (one `set_skins` write) and Discard; then saving, then saved. */
function SaveBar({ changes, save, onSave, onDiscard }: { changes: number; save: "idle" | "saving" | "saved"; onSave?: () => void; onDiscard?: () => void }) {
  if (changes === 0 && save !== "saved") return null;
  if (changes === 0) {
    return (
      <p role="status" className="drawer-carved flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm">
        <Icon name="circle-check" size="sm" className="text-success" />
        Tiles saved: your next board wears them
      </p>
    );
  }
  return (
    <m.div
      aria-label="Unsaved changes"
      role="region"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="drawer-raised sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl p-3"
    >
      <span className="text-sm">
        <span className="numeric font-semibold">{formatNumber(changes)}</span> {changes === 1 ? "change" : "changes"} to save
      </span>
      <span className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={onDiscard} disabled={save === "saving"}>
          Discard
        </Button>
        <Button size="sm" onClick={onSave} loading={save === "saving"}>
          {save === "saving" ? "Saving…" : "Save"}
        </Button>
      </span>
    </m.div>
  );
}
