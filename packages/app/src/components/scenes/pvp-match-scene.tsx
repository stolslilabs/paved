import { useEffect, useRef, type PointerEvent } from "react";
import { useAnimate, useReducedMotionConfig } from "motion/react";
import { formatInteger } from "@paved/game-core";
import type { PvpPlayer } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { StarMeter } from "../elements/star-meter";
import { StarRow } from "../elements/star-row";
import { BoardMap } from "../containers/board-map";
import { BoardScene } from "./board-scene";
import { ReplayBar, type AttackBoardProps, type PvpReplay } from "./pvp-attack-scene";

/** A match's two views (#786): the attacked village as it was at the attack's start, and the attack's build on it. */
export type MatchView = "village" | "build";

export interface PvpMatchSceneProps extends Omit<AttackBoardProps, "replay"> {
  /** The player's own attack, or an attack on their village. */
  side: "attack" | "defence";
  /** The other player: the defender of an attack, the attacker of a defence. */
  rival: PvpPlayer;
  view: MatchView;
  onView?: (view: MatchView) => void;
  /** The snapshot's score: the target, the village view's score. */
  target: number;
  /** The build's final score and stars (the switch's), whatever move the replay shows. */
  final: { score: number; stars: number };
  /** The star marks in whole percent of the target: v2's 80 / 90 / 100 %. */
  starPercents?: readonly number[];
  /** The replay's step-through, on the build's view (open point 2). */
  replay: PvpReplay;
}

/** How far a flick goes, px, and how long it takes at most, ms, to switch the view; under it, it is the board's pan. */
const FLICK_PX = 60;
const FLICK_MS = 400;
/** The crossfade of a switch: the board comes back from dimmed (reduced motion: a cut). */
const FADE_S = 0.28;

/**
 * A match (#786, `/pvp/match/:id`): one board and two views, switched at the top by a two-segment control with each view's score,
 * or by a flick across the board. The village is the attacked village at the attack's start (the snapshot): a rival's in red, the
 * player's own, in a defence, in green. The build is the attack's moves on an empty board from the starter, stepped through as a
 * replay (step, play): the player's own attack in blue, a rival's attack on the player's village in red. The camera stays still;
 * the board fades back in on a switch, a cut under reduced motion. The page gives the board for the view (`tiles`, `canvas`).
 */
export function PvpMatchScene({ side, rival, view, onView, target, final, starPercents, replay, ...board }: PvpMatchSceneProps) {
  const attack = side === "attack";
  const name = rival.name ?? "a player";
  const title = attack ? `Attack on ${name}` : `Defence: ${name}`;
  const reduced = useReducedMotionConfig() ?? false;
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!reduced && scope.current) void animate(scope.current, { opacity: [0.2, 1] }, { duration: FADE_S, ease: "easeOut" });
  }, [view, reduced, animate, scope]);

  // A flick across the board switches (left to the build, right to the village); a control's own press, a slower drag or a
  // mostly vertical one stays the board's.
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const down = (e: PointerEvent) => {
    start.current = (e.target as Element).closest("button, [data-bubble-avoid]") ? null : { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  const up = (e: PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || e.timeStamp - s.t > FLICK_MS) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < FLICK_PX || Math.abs(dx) < 2 * Math.abs(dy)) return;
    const next: MatchView = dx < 0 ? "build" : "village";
    if (next !== view) onView?.(next);
  };

  const canvas = (
    <div ref={scope} data-view={view} className="absolute inset-0">
      {board.canvas ?? <BoardMap tiles={board.tiles} highlight={false} />}
    </div>
  );
  const score = view === "village" ? target : board.score;
  return (
    <div data-match-side={side} onPointerDownCapture={down} onPointerUpCapture={up}>
      <BoardScene
        {...board}
        score={score}
        delta={view === "village" ? null : board.delta}
        lastScored={view === "village" ? [] : board.lastScored}
        canvas={canvas}
        mode="attack"
        title={title}
        now={0}
        readOnly
        attack={{
          meter: (
            <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2">
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={(v) => v && onView?.(v as MatchView)}
                aria-label="Match view"
                className="w-full gap-1 rounded-xl border border-border bg-card/90 p-1 shadow-lg backdrop-blur"
              >
                <ToggleGroupItem value="village" aria-label={`Village, ${formatInteger(target)} points`} className="h-auto min-w-0 flex-1 flex-col gap-0 py-1.5 whitespace-normal data-[state=off]:bg-transparent">
                  <span className="flex items-center gap-1.5 text-center text-xs leading-tight">
                    <span aria-hidden className={cn("size-2 rounded-full", attack ? "bg-destructive" : "bg-success")} />
                    {attack ? `${name}'s village` : "Your village"}
                  </span>
                  <span className="numeric text-sm font-semibold">{formatInteger(target)}</span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="build"
                  aria-label={`${attack ? "Your attack" : "The attack"}, ${formatInteger(final.score)} points, ${final.stars} of 3 stars`}
                  className="h-auto min-w-0 flex-1 flex-col gap-0 py-1.5 whitespace-normal data-[state=off]:bg-transparent"
                >
                  <span className="flex items-center gap-1.5 text-center text-xs leading-tight">
                    <span aria-hidden className={cn("size-2 rounded-full", attack ? "bg-info" : "bg-destructive")} />
                    {attack ? "Your attack" : "Their attack"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="numeric text-sm font-semibold">{formatInteger(final.score)}</span>
                    <StarRow stars={final.stars} size="xs" />
                  </span>
                </ToggleGroupItem>
              </ToggleGroup>
              {view === "build" && (
                <div className="w-full rounded-xl border border-border bg-card/90 px-3 pt-1 pb-2 shadow-lg backdrop-blur">
                  <StarMeter score={board.score} target={target} percents={starPercents} />
                </div>
              )}
            </div>
          ),
          // The village's view has no step-through: a line on what it shows, in the replay bar's place.
          replay:
            view === "build" ? (
              <ReplayBar replay={replay} />
            ) : (
              <p className="pointer-events-auto rounded-xl border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur">
                As it was when the attack began
              </p>
            ),
        }}
      />
    </div>
  );
}
