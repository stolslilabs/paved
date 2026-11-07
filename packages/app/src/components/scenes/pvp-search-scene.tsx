import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { leagueOf, type PvpPlayer } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { HudFrame } from "../elements/hud-frame";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LevelStar } from "../elements/level-star";
import { PlayerName } from "../elements/player-name";
import { SearchRadar } from "../elements/search-radar";
import { UiIcon } from "../elements/ui-icon";
import { LeaguePortrait } from "../containers/league-control";

/** `searching` (the opponent is drawn), `found` (the rival shows on the radar), `none` (no village in range), `error` (the draw failed). */
export type PvpSearchState = "searching" | "found" | "none" | "error";

export interface PvpSearchSceneProps {
  state: PvpSearchState;
  /** The attacker: the crowns the draw searches around. */
  player: PvpPlayer;
  /** `found`: the defender drawn. */
  opponent?: PvpPlayer | null;
  /** `error`: why. */
  error?: string | null;
  errorDetail?: ErrorDetail;
  /** Stops the search, or leaves. */
  onCancel?: () => void;
  /** Searches again (`none`, `error`). */
  onRetry?: () => void;
  /** The board behind the window, given by the page (`SearchVoid`: an empty village in its animated void); the board's ground without it. */
  canvas?: ReactNode;
  /** The scene's box: one viewport tall by default, its frame's height in a tab page's region (`h-full`, the league's waits). */
  className?: string;
}

/** The window's corner, the HUD drawer's (`HudFrame`'s `px`). */
const FACE = { "--hud-px": 16 } as CSSProperties;
/** Cancel, a price's raised grey (the Shop's `PriceButton`, the scout's Next), inline: the one stylesheet keeps no one-off. */
const RAISED: CSSProperties = {
  backgroundImage: "linear-gradient(var(--layer, transparent), var(--layer, transparent)), linear-gradient(var(--drawer-raised), var(--secondary))",
  boxShadow: "inset 0 1px 0 var(--drawer-bevel), 0 0 0 1px var(--hud-outline), 0 2px 0 1px var(--hud-outline)",
};
/** The two actions' word: the same size on both, a step smaller under 360 px. */
const WORD = "h-12 min-w-0 px-2 text-base font-black mobile:text-lg";

/** A state's lines under the radar: its title, then a short line. */
function Lines({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <>
      <h1 className="text-outline text-center text-2xl leading-tight font-bold text-balance desktop:text-3xl">{title}</h1>
      {children}
    </>
  );
}

/** The three dots of a word still at work ("Searching…"), lit in turn; still under reduced motion. Decorative. */
function Dots() {
  const reduced = useReducedMotionConfig() ?? false;
  return (
    <span aria-hidden className="inline-flex">
      {[0, 1, 2].map((i) => (
        <m.span key={i} initial={false} animate={reduced ? { opacity: 1 } : { opacity: [0.25, 1, 0.25] }} transition={reduced ? { duration: 0 } : { duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}>
          .
        </m.span>
      ))}
    </span>
  );
}

/**
 * The PvP search (#647), after the Paved UX Book's `search` and the user's asks of 2026-11-07 (ATTACK-SCOUT): over an empty village in
 * its animated void (the page's `canvas`), one window on the HUD's frame holds the painted radar, its sweep turning and the crowns
 * lighting as it passes, while the matchmaker draws a village near the attacker's crowns (#639): "Searching for a rival", "near 1,240"
 * and the crown. Its two actions share its foot, half its width each in every state: Cancel at the left, the raised grey; at the
 * right, the Vault's gold action held (dimmed, no light) with "Searching…" lit dot by dot. Found, the sweep stops and the rival shows
 * on the dish, their name under it, the window says "Scouting…" while the page moves on. None in range, or the draw failed: the dish
 * goes grey, the window says why, and the gold action is Search, which searches again. Full screen, no navigation: Cancel leaves.
 */
export function PvpSearchScene({ state, player, opponent, error, errorDetail, onCancel, onRetry, canvas, className }: PvpSearchSceneProps) {
  const found = state === "found" && opponent ? opponent : null;
  const quiet = state === "none" || state === "error";
  const working = state === "searching" || state === "found";
  return (
    <div className={cn("relative flex h-dvh min-h-[32rem] flex-col overflow-hidden bg-board text-foreground", className)}>
      {canvas && (
        <div aria-hidden data-search-board className="absolute inset-0">
          {canvas}
        </div>
      )}
      <main className="pointer-events-none relative z-10 flex flex-1 flex-col items-center justify-center px-4 pt-[env(safe-area-inset-top)] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <section aria-label="Search" data-state={state} className="pointer-events-auto relative isolate flex w-full max-w-80 flex-col items-center gap-3 px-4 pt-5 pb-4 desktop:max-w-96 desktop:px-6 desktop:pt-7 desktop:pb-5">
          {/* The book's window is solid: the HUD's face under the frame's see-through one. */}
          <span aria-hidden className="hud-face absolute -z-10 bg-hud-card" style={FACE} />
          <HudFrame px={16} />
          <div role="status" aria-live="polite" className="flex w-full flex-col items-center gap-2">
            <SearchRadar sweeping={state === "searching"} quiet={quiet} className="mb-1 w-44 tablet:w-48 desktop:w-52">
              {found && <LeaguePortrait player={found} look={found.look ?? null} league={leagueOf(found.crowns)} style={{ fontSize: "6rem" }} />}
            </SearchRadar>
            <AnimatePresence mode="wait" initial={false}>
              <m.div key={state} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex w-full flex-col items-center gap-1">
                {state === "searching" && (
                  <Lines title="Searching for a rival">
                    <p className="flex items-center gap-1.5 text-lg font-bold text-muted-foreground">
                      near
                      <span role="img" aria-label={`${formatInteger(player.crowns)} crowns`} className="flex items-center gap-1.5">
                        <span aria-hidden className="tabular-nums">
                          {formatInteger(player.crowns)}
                        </span>
                        <UiIcon name="crown" px={24} className="drawer-icon size-6" />
                      </span>
                    </p>
                  </Lines>
                )}
                {state === "found" && (
                  <Lines title="Rival found">
                    {found && (
                      <p className="flex max-w-full min-w-0 flex-wrap items-center justify-center gap-x-1.5">
                        <PlayerName name={found.name} address={found.address} className="text-outline min-w-0 pr-0.5 text-lg leading-snug font-bold" />
                        <LevelStar level={found.level} />
                      </p>
                    )}
                  </Lines>
                )}
                {state === "none" && (
                  <Lines title="No rival in range">
                    <p className="text-center text-sm leading-snug font-semibold text-muted-foreground">Every village near your crowns is shielded or was attacked by you lately. Try again in a while.</p>
                  </Lines>
                )}
              </m.div>
            </AnimatePresence>
          </div>
          <InlineError title="Search" message={state === "error" ? (error ?? "The search could not start.") : null} detail={errorDetail} className="w-full text-left" />
          {/* The window's foot: Cancel and the gold action, half its width each whatever the state, in their places. */}
          <div className="grid w-full grid-cols-2 gap-2 pt-1">
            <Button variant="ghost" style={RAISED} className={cn(WORD, "text-outline rounded-xl")} onClick={onCancel} disabled={state === "found"}>
              Cancel
            </Button>
            <Button variant="ghost" style={GOLD_ACTION} className={cn(WORD, "relative text-foreground")} onClick={onRetry} disabled={working || !onRetry} aria-label={working ? (found ? "Scouting" : "Searching") : "Search"}>
              {!working && onRetry && <GoldShine />}
              {working ? (
                <span className="inline-flex items-baseline">
                  {found ? "Scouting" : "Searching"}
                  <Dots />
                </span>
              ) : (
                "Search"
              )}
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
