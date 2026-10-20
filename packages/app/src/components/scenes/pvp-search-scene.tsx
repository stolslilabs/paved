import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { leagueOf, type PvpPlayer } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Crowns } from "../elements/crowns";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LeagueCrest } from "../elements/league-crest";
import { SearchClouds } from "../elements/search-clouds";
import { PvpPlayerRow } from "../containers/pvp-player-row";

/** `searching` (the opponent is drawn), `found` (the clouds part over them), `none` (no village in range), `error` (the draw failed). */
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
  /** Stops the search (`searching`), or leaves (`none`, `error`). */
  onCancel?: () => void;
  onRetry?: () => void;
}

/**
 * The PvP search (#647): a waiting screen under drifting clouds, as Clash of Clans', while the matchmaker draws a village
 * near the attacker's crowns (#639). Found, the clouds part and the defender's name shows, and the page moves on to the
 * scout. Full screen, no navigation: the only way out is Cancel.
 */
export function PvpSearchScene({ state, player, opponent, error, errorDetail, onCancel, onRetry }: PvpSearchSceneProps) {
  const league = leagueOf(player.crowns);
  return (
    <div className="relative flex h-dvh min-h-[32rem] flex-col overflow-hidden bg-linear-to-b from-sky-search-top to-sky-search-bottom text-foreground">
      <SearchClouds parted={state !== "searching"} />
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-4 pt-[env(safe-area-inset-top)]">
        <div role="status" aria-live="polite" className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border border-border bg-card/90 px-4 py-5 text-center shadow-lg backdrop-blur">
          <AnimatePresence mode="wait" initial={false}>
            {state === "searching" && (
              <m.div key="searching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2">
                <Icon name="magnifying-glass" size="xl" className="text-primary motion-safe:animate-pulse" />
                <h1 className="font-display text-2xl">Searching for a village</h1>
                <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-sm text-muted-foreground">
                  <span>Near your</span>
                  <Crowns value={player.crowns} size="sm" />
                  <span>in</span>
                  <LeagueCrest league={league} size="sm" />
                </p>
              </m.div>
            )}
            {state === "found" && opponent && (
              <m.div key="found" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex w-full flex-col items-center gap-3">
                <h1 className="font-display text-2xl">Village found</h1>
                <PvpPlayerRow player={opponent} className="w-full rounded-lg bg-secondary/60 px-3 py-2 text-left" />
              </m.div>
            )}
            {state === "none" && (
              <m.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2">
                <Icon name="cloud" size="xl" className="text-muted-foreground" />
                <h1 className="font-display text-2xl">No village in range</h1>
                <p className="text-sm text-muted-foreground">Every village near your crowns is under a shield or was attacked by you lately. Try again in a while.</p>
              </m.div>
            )}
          </AnimatePresence>
          <InlineError title="Search" message={state === "error" ? (error ?? "The search could not start.") : null} detail={errorDetail} className="w-full text-left" />
        </div>
      </main>
      <footer className="relative z-10 flex justify-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {(state === "none" || state === "error") && (
          <Button size="lg" onClick={onRetry}>
            <Icon name="rotate" size="sm" />
            Search again
          </Button>
        )}
        {state !== "found" && (
          <Button size="lg" variant="secondary" onClick={onCancel}>
            {state === "searching" ? "Cancel" : "Leave"}
          </Button>
        )}
      </footer>
    </div>
  );
}
