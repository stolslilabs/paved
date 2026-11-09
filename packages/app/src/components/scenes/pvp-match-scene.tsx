import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useAnimate, useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { Slider as SliderPrimitive } from "radix-ui";
import type { BoardTile } from "@paved/chain";
import { formatInteger } from "@paved/game-core";
import type { PvpPlayer } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { UiIcon } from "../elements/ui-icon";
import { BoardMap } from "../containers/board-map";
import { TopBar } from "../containers/top-bar";
import type { PvpReplay } from "./pvp-attack-scene";

/** A match's two views (#786): the attacked village as it was at the attack's start, and the attack's build on it. */
export type MatchView = "village" | "build";

export interface PvpMatchSceneProps {
  /** The player's own attack, or an attack on their village. */
  side: "attack" | "defence";
  /** The other player: the defender of an attack, the attacker of a defence. */
  rival: PvpPlayer;
  view: MatchView;
  onView?: (view: MatchView) => void;
  /** The snapshot's score: the target, 100 % of it is 3 stars. */
  target: number;
  /** The build's final score and stars, whatever move the replay shows. */
  final: { score: number; stars: number };
  /** The player's crowns from the match: won (positive) or lost (negative). */
  crowns: number;
  /** The replay's step-through of the build. */
  replay: PvpReplay;
  /** The view's board: its tiles (the plan view's, without `canvas`). */
  tiles: BoardTile[];
  /** The 3D board for the view (`BoardCanvas`), given by the page; without it the plan view (`BoardMap`), as in jsdom. */
  canvas?: ReactNode;
  onBack?: () => void;
}

/** How far a flick goes, px, and how long it takes at most, ms, to switch the view; under it, it is the board's pan. */
const FLICK_PX = 60;
const FLICK_MS = 400;
/** The crossfade of a switch: the board comes back from dimmed (reduced motion: a cut). */
const FADE_S = 0.28;

/** A tab: the book's label at the board's top corner, its own; the active one lit and underlined in gold (the owner's choice B). */
const TAB = "text-outline h-11 px-1 text-lg font-semibold decoration-primary decoration-2 underline-offset-8 data-[state=active]:underline";

/** The tabs' labels: the book's for an attack; a defence's, the owner's choice among three (the book draws only an attack). */
const ATTACK_TABS: Record<MatchView, string> = { village: "Rival", build: "Your attack" };
const DEFENCE_TABS: Record<MatchView, string> = { village: "You", build: "Rival" };

/**
 * A match (#786, `/pvp/match/:id`). MATCH-PAGE (the Paved UX Book's "Battle log", the owner's decisions of 2026-11-05): a
 * full-screen page under the pages' header, titled "Battle log" with Back up to the League. The one board in a framed panel (the
 * book's blue rim; its pan and zoom the board's own), its two views two tabs at its top corners, the book's labels ("Rival" and
 * "Your attack"; a defence's "You" and "Rival"), a flick across the board switching too: the village is the attacked village at the
 * attack's start (the snapshot), the build the attack's moves on an empty board from the starter. The board fades back in on a
 * switch, a cut under reduced motion. Over the board's foot the match's three stars, under it the caption (the side, the rival, the
 * score, the crowns). Then the replay's panel: the gold Play or Pause, the moves' timeline and "Move 14 / 23". No split (one board
 * a WebGL context). On a phone the page fills the screen; from `tablet` the panels are centred, at 42 rem at most.
 */
export function PvpMatchScene({ side, rival, view, onView, target, final, crowns, replay, tiles, canvas, onBack }: PvpMatchSceneProps) {
  const attack = side === "attack";
  const name = rival.name ?? "a player";
  const labels = attack ? ATTACK_TABS : DEFENCE_TABS;
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
    start.current = (e.target as Element).closest("button, [role=tab], [role=slider]") ? null : { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  const up = (e: PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || e.timeStamp - s.t > FLICK_MS) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < FLICK_PX || Math.abs(dx) < 2 * Math.abs(dy)) return;
    show(dx < 0 ? "build" : "village");
  };
  // To the village, the replay pauses (its board is out of view); the replay's play or timeline brings the build back. Once a
  // view: a tab's press and its focus both ask for it before the page has re-rendered (Radix's automatic activation).
  const asked = useRef(view);
  useLayoutEffect(() => {
    asked.current = view;
  });
  const show = (next: MatchView) => {
    if (next === asked.current) return;
    asked.current = next;
    if (next === "village" && replay.playing) replay.onPause?.();
    onView?.(next);
  };
  const toBuild = () => show("build");

  return (
    <div data-match-side={side} className="flex h-dvh min-h-[32rem] flex-col bg-background text-foreground">
      <TopBar title="Battle log" onBack={onBack} balances={false} />
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <section aria-label="Board" data-slot="match-panel" className="match-frame relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card">
          <Tabs
            value={view}
            onValueChange={(v) => show(v as MatchView)}
            data-slot="match-board"
            className="relative min-h-0 flex-1 gap-0 overflow-hidden"
            onPointerDownCapture={down}
            onPointerUpCapture={up}
          >
            <div ref={scope} data-view={view} className="absolute inset-0">
              {canvas ?? <BoardMap tiles={tiles} highlight={false} fit />}
            </div>
            <TabsList aria-label="Match view" className="absolute inset-x-0 top-0 grid h-auto w-auto rounded-none bg-transparent px-3 pt-1 [&>[data-slot=tabs-indicator]]:hidden">
              <TabsTrigger value="village" aria-label={`${labels.village}, ${formatInteger(target)} points`} className={cn(TAB, "justify-self-start")}>
                {labels.village}
              </TabsTrigger>
              <TabsTrigger value="build" aria-label={`${labels.build}, ${formatInteger(final.score)} points, ${final.stars} of 3 stars`} className={cn(TAB, "justify-self-end")}>
                {labels.build}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="village" className="sr-only">
              {attack ? "The rival's village as it was when the attack began." : "Your village as it was when the attack began."}
            </TabsContent>
            <TabsContent value="build" className="sr-only">
              {attack ? "Your attack's moves, on an empty board from the starter." : "Their attack's moves, on an empty board from the starter."}
            </TabsContent>
            <MatchStars stars={final.stars} />
          </Tabs>
          <p data-slot="match-caption" className="flex shrink-0 items-center justify-center gap-1 px-2 py-2.5 text-sm font-bold whitespace-nowrap">
            <span className="shrink-0 text-muted-foreground">{attack ? "Attack" : "Defence"}</span>
            <Dot />
            {/* Cut with an ellipsis where the phone is too narrow (320 to 360 px), its whole text in the tooltip, as the pages' title. */}
            <span title={name} className="min-w-0 truncate">
              {name}
            </span>
            <Dot />
            <span className="shrink-0 tabular-nums">{formatInteger(final.score)}</span>
            <Dot />
            <CrownsWon value={crowns} />
          </p>
        </section>
        <section aria-label="Replay" data-slot="match-replay" className="drawer-carved flex shrink-0 items-center gap-3 rounded-2xl py-2 pr-4 pl-3">
          <PlayButton
            replay={replay}
            onPlay={() => {
              toBuild();
              replay.onPlay?.();
            }}
          />
          <MoveTimeline
            replay={replay}
            onSeek={(to) => {
              toBuild();
              replay.onSeek?.(to);
            }}
          />
          {/* The move shown at the bar's right end (the owner's ask of 2026-11-05), the bar centred on Play. */}
          <p data-slot="match-move" className="shrink-0 text-right leading-tight">
            <span className="block text-xs font-semibold text-muted-foreground">Move</span>{" "}
            <span className="text-sm font-bold whitespace-nowrap tabular-nums">
              {formatInteger(replay.move)} / {formatInteger(replay.total)}
            </span>
          </p>
        </section>
      </div>
    </div>
  );
}

/** The caption's separator. */
function Dot() {
  return (
    <span aria-hidden className="shrink-0 text-muted-foreground">
      ·
    </span>
  );
}

/** The crowns the match gave the player: the painted crown and the signed figure (the book's). */
function CrownsWon({ value }: { value: number }) {
  const name = `${value < 0 ? "-" : "+"}${formatInteger(Math.abs(value))} ${Math.abs(value) === 1 ? "crown" : "crowns"}`;
  return (
    <span role="img" aria-label={name} data-slot="match-crowns" className="flex shrink-0 items-center gap-1">
      <UiIcon name="crown" px={20} className="drawer-icon size-5" />
      <span aria-hidden className="tabular-nums">
        {value < 0 ? "−" : "+"}
        {formatInteger(Math.abs(value))}
      </span>
    </span>
  );
}

/** The match's stars over the board's foot (the book's three big gold stars): the earned ones gold, the others greyed. */
function MatchStars({ stars }: { stars: number }) {
  return (
    <span role="img" aria-label={`${stars} of 3 stars`} data-slot="match-stars" data-stars={stars} className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
      {[1, 2, 3].map((n) => (
        <UiIcon key={n} name="star" px={48} className={cn("drawer-icon size-12", n > stars && "grayscale opacity-60")} />
      ))}
    </span>
  );
}

/** The replay's play or pause: the book's round gold button (56 px), Pause while it plays; at the end, Play starts it again. */
function PlayButton({ replay, onPlay }: { replay: PvpReplay; onPlay: () => void }) {
  const playing = replay.playing;
  const label = playing ? "Pause" : replay.move >= replay.total ? "Play from the start" : "Play";
  return (
    <m.button
      type="button"
      aria-label={label}
      disabled={!playing && replay.total === 0}
      onClick={playing ? replay.onPause : onPlay}
      whileTap={{ scale: 0.92 }}
      className="grid size-14 shrink-0 cursor-pointer place-items-center rounded-full disabled:opacity-50"
    >
      {playing ? <UiIcon name="pause" px={56} className="drawer-icon size-14" /> : <UiIcon name="play" px={56} className="drawer-icon size-14" />}
    </m.button>
  );
}

/** The timeline's dots at most: the book's twelve, spread over the moves (one a move for a shorter attack). */
const TIMELINE_DOTS = 12;
/** The least room between two dots' centres (px): a narrow phone shows fewer, so the orbs never touch. */
const DOT_ROOM = 22;
/** The big orb's size (px, `size-6`): the rail and the dots sit on its track, inset by half of it. */
const THUMB_PX = 24;

/**
 * The Missions' painted rail and nodes (the owner's ask of 2026-11-05: the replay's bar in the Daily's and Weekly's style, their
 * `MilestonesBar`): the steel rail the whole line and its gold up to the move shown, their rounded ends whole and their middle never
 * stretched (RAILS); a passed dot the gold orb, glowing, one ahead the dark bead. Their copies are `MISSION_PARTS`' of
 * `elements/medallion-art.ts` (rail 12 and 17 px tall, orb and bead 32 and 64 px), their URLs written here (the rail drawn
 * as `missionRail` draws it): importing that module splits it out of the Missions' chunk into a chunk of its own, one more in the entry's
 * preload lists (5 bytes of the first load's budget, measured).
 */
const part = (name: string, size: number) => `url("/ui-art/missions/${size}/${name}.webp")`;
/** The rail 8 px tall, drawn as `missionRail` draws it (RAILS): its painting's middle repeated at the rails' grain, its ends round. */
const rail = (name: "rail-track" | "rail-fill", size: number, width: number): CSSProperties => ({
  height: 8,
  minWidth: 8,
  borderRadius: 9999,
  backgroundImage: part(name, size),
  backgroundSize: `${((width * 8) / size / 3).toFixed(1)}px 100%`,
  backgroundRepeat: "repeat-x",
  backgroundPosition: "0 50%",
  boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--hud-outline) 85%, transparent)",
});
const node = (name: "orb" | "bead") => `image-set(${part(name, 32)} 1x, ${part(name, 64)} 2x) center / 100% 100% no-repeat`;
const ORB: CSSProperties = { background: node("orb"), boxShadow: "0 0 9px 1px color-mix(in oklab, var(--primary) 70%, transparent)" };
const BEAD: CSSProperties = { background: node("bead") };

/** The timeline's width (px) as laid out, 0 before (or without ResizeObserver, as in jsdom). */
function useWidth() {
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [width, ref] as const;
}

/**
 * The replay's timeline (the book's, in the Missions' painted look): the steel rail, gold up to the move shown; dots along it, gold
 * orbs once passed, dark beads ahead; the move shown the big glowing orb. As many dots as the width holds (at most the book's twelve,
 * evenly spaced). A Radix slider: drag it or tap the rail to go to a move, the arrow keys step one move, Home and End go to the ends.
 * The rail and the dots sit on the thumb's own track (inset by half its size), so the big orb lands on its move's place.
 */
function MoveTimeline({ replay, onSeek }: { replay: PvpReplay; onSeek: (move: number) => void }) {
  const { move, total } = replay;
  const [width, measure] = useWidth();
  const fits = width > 0 ? Math.floor((width - THUMB_PX) / DOT_ROOM) + 1 : TIMELINE_DOTS;
  const count = Math.max(2, Math.min(total + 1, TIMELINE_DOTS, fits));
  const span = Math.max(total, 1);
  // Evenly spaced, each at its share of the moves (not rounded to one: the dots keep one spacing); a dot the big orb would touch is
  // left out (measured in px once laid out), the move shown taking its place as the book's current dot does.
  const track = width - THUMB_PX;
  const touches = (at: number) => (track > 0 ? (Math.abs(at - move) / span) * track < THUMB_PX / 2 + 10 : Math.abs(at - move) < (0.6 * total) / (count - 1));
  const dots = total > 0 ? Array.from({ length: count }, (_, i) => (i * total) / (count - 1)).filter((at) => !touches(at)) : [];
  return (
    <SliderPrimitive.Root
      ref={measure}
      value={[move]}
      min={0}
      max={span}
      step={1}
      disabled={total === 0}
      onValueChange={([to]) => to !== undefined && to !== move && onSeek(to)}
      data-slot="match-timeline"
      className="relative flex h-11 min-w-0 flex-1 touch-none items-center select-none"
    >
      {/* Radix's track, bare: the pointer's measure. The painted rail is drawn over it, inset by half the big orb. */}
      <SliderPrimitive.Track className="relative mx-3 h-2 grow" />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 left-3">
        <span data-slot="match-rail" className="absolute inset-x-0 top-1/2 -translate-y-1/2" style={rail("rail-track", 12, 1325)} />
        {move > 0 && <span data-slot="match-rail-fill" className="absolute top-1/2 left-0 -translate-y-1/2" style={{ ...rail("rail-fill", 17, 1313), width: `${(move / span) * 100}%` }} />}
        {dots.map((at) => (
          <span
            key={at}
            data-slot="match-dot"
            data-done={at <= move || undefined}
            style={{ left: `${(at / span) * 100}%`, ...(at <= move ? ORB : BEAD) }}
            className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full", at <= move ? "size-4" : "size-3.5")}
          />
        ))}
      </span>
      <SliderPrimitive.Thumb
        aria-label="Move"
        aria-valuetext={`Move ${formatInteger(move)} of ${formatInteger(total)}`}
        style={ORB}
        className="block size-6 cursor-pointer rounded-full"
      />
    </SliderPrimitive.Root>
  );
}
