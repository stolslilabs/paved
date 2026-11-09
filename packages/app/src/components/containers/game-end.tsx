import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { formatInteger, levelStatus } from "@paved/game-core";
import { haptic } from "../../lib/haptics";
import { cn } from "../../lib/utils";
import { BLACK_OUTLINE } from "../elements/black-outline";
import { CHEST_NAME, type ChestRank } from "../elements/chest-designs";
import { CHEST_ART_REM, CHEST_SPENT, GOLD_SOFT } from "../elements/chest-designs";
import { ChestIcon } from "../elements/chest-icon";
import { CHEST_EFFECTS, chestEffectUrl, pickSize } from "../elements/chest-images";
import { Countdown } from "../elements/countdown";
import { goldPillStyle } from "../elements/friends-art";
import { HudFrame } from "../elements/hud-frame";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LazyChestArt } from "../elements/lazy-chest-art";
import { LevelBar } from "../elements/level-bar";
import { missionPartImage } from "../elements/medallion-art";
import { EMPTY_STAR } from "../elements/painted-stars";
import type { TileArt } from "../elements/tile-chip";
import type { PlayerProgress } from "../elements/xp-motion";
import { tileName } from "../elements/tile-render";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { useSfx } from "./audio-provider";
import { TilePicture } from "./chest-reveal";

/**
 * A game's chest on its end (END-CHEST, the owner's ask of 2026-11-06: every chest opens where it is won, the Chests page gone): `won`
 * (tap to open), `opening` (its draw on its way), `kept` (its tile taken: `plan`, or null when the end does not know it), `capped`
 * (stars won but the day's PvP slots full: disabled, the slots' reset counting down), `none` (nothing shown). While the chests' read
 * is not there: `loading` (the panel disabled, "Loading…"), `error` (the read failed: the message and Retry, which reads it again;
 * `retrying` while it does), `unavailable` (the network serves no chests: nothing to open here). A Story level's chest, when this run
 * won none (STORY-PAGE, the owner's ask of 2026-11-07: the end says so): `already` (the level gave it before), `missed` (3 stars win
 * it, the first time).
 */
export type EndChest =
  | { state: "won"; rank: ChestRank }
  | { state: "loading"; rank: ChestRank }
  | { state: "error"; rank: ChestRank; message: string; detail?: ErrorDetail; retrying?: boolean; onRetry?: () => void }
  | { state: "unavailable"; rank: ChestRank }
  | { state: "opening"; rank: ChestRank }
  | { state: "kept"; rank: ChestRank; plan: number | null }
  | { state: "capped"; rank: ChestRank; resetsAt: number }
  | { state: "already"; rank: ChestRank }
  | { state: "missed"; rank: ChestRank }
  | { state: "none" };

/** The XP a game gave (PvP, Story): the gain, the XP after it and the level's span (its floor and the next level's, the floor at the cap). */
export interface EndXp {
  gained: number;
  xp: number;
  level: number;
  floor: number;
  next: number;
  /** The level before the game: a level up is said when it is lower. */
  levelBefore: number;
}

/** The XP a game gave and the level it leaves, from the player's XP now (`levelStatus`). */
export function endXp(xp: number, gained: number): EndXp {
  const after = levelStatus(xp);
  return { gained, xp: after.xp, level: after.level, floor: after.floor, next: after.next, levelBefore: levelStatus(xp - gained).level };
}

/** An answer of the window: its words and what it does; its look its slot's (raised grey, gold for `primary`) unless `tone` says. */
export interface EndAction {
  label: string;
  onClick?: () => void;
  /** The look over its slot's (STORY-PAGE: a level failed, Retry the gold and Next the raised grey). */
  tone?: "raised" | "gold";
  /** Shown, dimmed, not pressable (a control never leaves: a level failed, its Next). */
  disabled?: boolean;
}

export interface GameEndProps {
  /** The stars won, 0 to 3 (none drawn when `mark` crowns the window instead). */
  stars?: number;
  /** Each star's share filled, 0 to 1, from the score (the stars' bar's place, the owner's ask of 2026-11-06); unset, the won ones full. */
  fills?: readonly number[];
  /**
   * What crowns the window in place of the three stars (TRAINING-END: Training's crown, `EndMark`, the mark of its score meter). Unset:
   * the stars.
   */
  mark?: ReactNode;
  /** The verdict over the window, in capitals (the owner's ask of 2026-11-08): "VICTORY", "GAME OVER". */
  verdict: string;
  /** Under it: "against Wren of Hollowmere", a level's title. */
  subtitle?: ReactNode;
  /** The score: "4,037 / 3,216" (against the village's), "4,037". Left out: none over the rows (the Puzzle's, whose first row is its score). */
  score?: ReactNode;
  /** The carved card's rows (the crowns, the XP), soft rules between them. */
  rows?: readonly ReactNode[];
  /** Lines under the rows: a new best, the points short of the next star. */
  notes?: ReactNode;
  /** The chest's panel (`EndChestPanel`). */
  chest?: ReactNode;
  /** The book's two answers: the raised grey (Home, Retry) and the gold (Again, Next). */
  secondary?: EndAction;
  /** A second raised grey answer between them, on the same row (STORY-PAGE: Story's Levels, the owner's ask of 2026-11-07). */
  middle?: EndAction;
  primary?: EndAction;
  /**
   * The cross at the window's top right (the owner's ask of 2026-11-06, the Board's new place): the scores close and the game's board
   * shows, with `ShowScores` to bring them back.
   */
  onClose?: () => void;
  /** The stars in at once (reduced motion, a tap that skipped them). */
  instant?: boolean;
  children?: ReactNode;
  className?: string;
}

/** The verdict, the book's: large, gold, outlined thick in black. */
const VERDICT: CSSProperties = { textShadow: BLACK_OUTLINE };

/** The end's verdict ("VICTORY", "GAME OVER"), the book's: large, gold, outlined thick in black; a long one a size down. */
export function EndVerdict({ verdict, className }: { verdict: string; className?: string }) {
  return (
    <h2 className={cn("font-game leading-none text-balance text-primary", verdict.length > 10 ? "text-4xl" : "text-5xl", className)} style={VERDICT}>
      {verdict}
    </h2>
  );
}
/** The soft rule between two rows of the carved card (the Shop's panels'). */
const ROW_RULE: CSSProperties = { borderTop: "1px solid color-mix(in oklab, var(--drawer-bevel) 45%, transparent)" };
/** The raised grey answer (the drawer's rule: raised presses), its word outlined in black as the gold one's. */
const RAISED = "drawer-raised h-12 w-full rounded-xl font-black text-foreground";
const RAISED_WORDS: CSSProperties = { textShadow: BLACK_OUTLINE };
/** The gold answer: Follow back's painted pill, 48 px, its word outlined in black. */
const GOLD: CSSProperties = { ...goldPillStyle(48), textShadow: BLACK_OUTLINE };
/** The stars' beats (s): the first's delay, then one after the other. */
export const END_STARS = { lead: 0.35, gap: 0.32 } as const;

/** A box `w` by `h` centred on its parent's middle. */
const centred = (w: number, h = w): CSSProperties => ({ position: "absolute", left: "50%", top: "50%", width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, maxWidth: "none" });
/**
 * The book's gold halo, the Missions' own (`gift-glow`, cut from the book by Codex: a yellow heart, short orange rays fading, no haze),
 * saturated as theirs. It replaced a first halo drawn by Codex that carried a grey haze over the light (the owner's note of 2026-11-06).
 */
const HALO: CSSProperties = { background: `${missionPartImage("gift-glow")} center / contain no-repeat`, filter: "saturate(1.6)" };
/** A spot round a prize: its place (shares of the prize's side from its centre), its size (shares of its side), its delay (s). */
type Spot = { x: number; y: number; s: number; d: number };
/** The glints round a full star, above it mostly, as the book's. */
const STAR_GLINTS: readonly Spot[] = [
  { x: -0.6, y: -0.45, s: 0.55, d: 0 },
  { x: 0.58, y: -0.58, s: 0.45, d: 0.5 },
  { x: 0.1, y: -0.8, s: 0.38, d: 1.1 },
  { x: -0.25, y: -0.72, s: 0.3, d: 0.3 },
  { x: 0.68, y: 0.3, s: 0.32, d: 0.8 },
  { x: -0.72, y: 0.2, s: 0.28, d: 1.4 },
];
/** The chest to open's side on the panel (px): `ChestArt`'s `md`. */
const CHEST_PX = CHEST_ART_REM.md * 16;
/** The glints round the chest to open. */
const CHEST_GLINTS: readonly Spot[] = [
  { x: -0.42, y: -0.32, s: 0.45, d: 0 },
  { x: 0.4, y: -0.4, s: 0.36, d: 0.6 },
  { x: 0.52, y: 0.08, s: 0.3, d: 1.2 },
  { x: -0.54, y: 0.12, s: 0.3, d: 0.9 },
  { x: 0.04, y: -0.55, s: 0.32, d: 0.3 },
];
/**
 * The light behind a full star, the book's (`attack-end`, the owner's ask of 2026-11-06): extracted from its stars by Codex's image tool,
 * the light of one star alone (a yellow heart, fine orange rays, three sparkles) on black turned to transparency (`star-light`), so
 * full stars side by side share one sunburst, as the book's. `STAR_LIGHT` times the star's width.
 */
const STAR_LIGHT = 3.4;

/**
 * The opened chest's beats (`chest-art.tsx`'s light, the owner's ask of 2026-11-06: the same here, alive, not still): waves of the
 * light gushing out one after the other, growing and fading (`GUSH_S` each, `GUSHES` at once, each turned a little from the last).
 */
const GUSH_S = 1.6;
const GUSHES = [0, 1, 2] as const;

/**
 * A prize's light `px` wide in its `look` (an image as background), the opened chest's way: it bursts in at `delay` with a flash (no
 * fade to wait for: the owner's note of 2026-11-06 on a light that came late), waves of it gushing out from that moment, two copies
 * turning either way, the one in front breathing; under reduced motion the light alone, still.
 */
function Shine({ look, px, delay, still, className }: { look: CSSProperties; px: number; delay: number; still: boolean; className?: string }) {
  const box: CSSProperties = { ...centred(px), ...look };
  return (
    <m.span
      aria-hidden
      data-slot="prize-halo"
      className={cn("pointer-events-none absolute inset-0 -z-10", className)}
      initial={still ? false : { opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={still ? { duration: 0 } : { delay, duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
    >
      {!still && (
        // The flash as it lights, the opened chest's.
        <m.span
          data-part="flash"
          style={box}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 1, 0], scale: [0.4, 1.2, 1.4] }}
          transition={{ delay, duration: 0.5, times: [0, 0.3, 1], ease: "easeOut" }}
        />
      )}
      {!still &&
        GUSHES.map((i) => (
          <m.span
            key={i}
            data-part="gush"
            style={{ ...box, rotate: `${i * 20}deg` }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 0.7, 0], scale: [0.6, 1.05, 1.35] }}
            transition={{ duration: GUSH_S, times: [0, 0.3, 1], ease: "easeOut", repeat: Infinity, delay: delay + (i * GUSH_S) / GUSHES.length }}
          />
        ))}
      {!still && (
        <m.span
          data-part="fan"
          style={{ ...box, opacity: 0.5 }}
          initial={{ rotate: 0 }}
          animate={{ rotate: -360 }}
          transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
        />
      )}
      <m.span
        data-part="light"
        style={box}
        initial={false}
        animate={still ? { rotate: 0, scale: 1 } : { rotate: 360, scale: [1, 1.1, 1] }}
        transition={still ? { duration: 0 } : { rotate: { duration: 10, repeat: Infinity, ease: "linear" }, scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut" } }}
      />
    </m.span>
  );
}

/** The book's light behind a full star `px` wide (`star-light`), lit at `delay`, alive as the opened chest's; still under reduced motion. */
function StarLight({ px, delay, still }: { px: number; delay: number; still: boolean }) {
  const light = chestEffectUrl("star-light", pickSize(CHEST_EFFECTS["star-light"].sizes, px * STAR_LIGHT * 2));
  return <Shine look={{ background: `url("${light}") center / contain no-repeat` }} px={px * STAR_LIGHT} delay={delay} still={still} />;
}

/**
 * The light behind a prize (END-SCREENS, the owner's asks of 2026-11-06: the book's, tight): the gold halo (`HALO`), alive as the opened
 * chest's (`Shine`); still under reduced motion. `px` its side; `delay` when it lights.
 */
export function PrizeHalo({ px, delay = 0, className }: { px: number; delay?: number; className?: string }) {
  const reduced = useReducedMotionConfig() ?? false;
  return <Shine look={HALO} px={px} delay={delay} still={reduced} className={className} />;
}

/** The sparkles twinkling round a prize `px` wide (the glint, Codex's after the book), each at its spot; still under reduced motion. */
function Glints({ px, spots, delay = 0, still }: { px: number; spots: readonly Spot[]; delay?: number; still: boolean }) {
  const glint = chestEffectUrl("glint", pickSize(CHEST_EFFECTS.glint.sizes, px * 0.6));
  return spots.map((g, k) => {
    const box: CSSProperties = { ...centred(px * g.s), left: `${50 + g.x * 100}%`, top: `${50 + g.y * 100}%` };
    return still ? (
      <img key={k} src={glint} alt="" aria-hidden draggable={false} className="pointer-events-none select-none" style={{ ...box, opacity: 0.9 }} />
    ) : (
      <m.img
        key={k}
        src={glint}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none select-none"
        style={box}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.2, 1, 0.85, 0.2], rotate: [0, 30, 60, 90] }}
        transition={{ delay: delay + g.d, duration: 1.6, times: [0, 0.25, 0.75, 1], repeat: Infinity, repeatDelay: 0.5, ease: "easeInOut" }}
      />
    );
  });
}

/**
 * A game's end in the book's window (END-SCREENS, after the Paved UX Book's `attack-end`; the owner's asks of 2026-11-06, PvP and
 * Story): over the blurred board, a framed window (the HUD's frame, `HudFrame`) crowned by its three painted stars, the won ones
 * popping in one after the other with a sound and a buzz, a light behind them and sparkles bursting out (as the opened chest), the
 * others greyed; the verdict large in gold, what it was against, the score; a carved card of rows (the crowns, the XP); the chest's
 * panel; the raised and gold answers, and smaller ones under them.
 */
export function GameEnd({ stars = 0, fills, mark, verdict, subtitle, score, rows, notes, chest, secondary, middle, primary, onClose, instant, children, className }: GameEndProps) {
  const answers = [secondary, middle, primary].filter(Boolean).length;
  // Three on one row: a step smaller, so each word keeps its line at 320 px.
  const word = answers === 3 ? "px-2 text-base" : "px-3 text-lg";
  return (
    <section aria-label="Result" data-verdict={verdict} className={cn("relative isolate mx-auto mt-14 flex w-full max-w-sm flex-col items-center gap-3 px-4 pt-12 pb-4 text-center font-round", className)}>
      <HudFrame px={16} />
      {onClose && (
        // The drawers' red cross, at the window's top right, clear of the stars.
        <button
          type="button"
          aria-label="Close the scores"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="state-layer absolute top-2 right-2 z-10 grid size-11 cursor-pointer place-items-center rounded-full outline-none"
        >
          <UiIcon name="close" px={36} className="drawer-icon size-9" />
        </button>
      )}
      {mark ?? <EndStars stars={stars} fills={fills} instant={instant} className="absolute -top-14 left-1/2 -translate-x-1/2" />}
      <EndVerdict verdict={verdict} />
      {subtitle && <p className="-mt-1 text-sm font-semibold text-muted-foreground">{subtitle}</p>}
      {score !== undefined && (
        <p aria-label="Score" className="text-outline text-2xl leading-none font-bold text-foreground tabular-nums">
          {score}
        </p>
      )}
      {rows && rows.length > 0 && (
        <div className="drawer-carved flex w-full flex-col rounded-2xl px-3 text-left">
          {rows.map((row, i) => (
            <div key={i} style={i > 0 ? ROW_RULE : undefined} className="flex items-center gap-3 py-2.5">
              {row}
            </div>
          ))}
        </div>
      )}
      {notes}
      {chest}
      {children}
      {answers > 0 && (
        <div className={cn("grid w-full gap-2", answers === 3 ? "grid-cols-3" : answers === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {[secondary, middle, primary].map((answer, i) => {
            if (!answer) return null;
            const gold = (answer.tone ?? (i === 2 ? "gold" : "raised")) === "gold";
            return (
              <Button
                key={answer.label}
                variant="ghost"
                data-tone={gold ? "gold" : "raised"}
                style={gold ? GOLD : RAISED_WORDS}
                className={cn(gold ? "h-12 w-full font-black text-foreground" : RAISED, word)}
                disabled={answer.disabled}
                onClick={answer.onClick}
              >
                {answer.label}
              </Button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * The scores closed (`GameEnd`'s cross), over the game's board: the gold pill at the foot of the screen bringing them back (the owner's
 * ask of 2026-11-06: the scores shown again from the scene).
 */
export function ShowScores({ onClick }: { onClick: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
      <Button variant="ghost" aria-label="Show the scores" style={GOLD} className="pointer-events-auto h-12 gap-2 px-6 text-lg font-black text-foreground" onClick={onClick}>
        <UiIcon name="star" px={28} className="size-7" />
        Scores
      </Button>
    </div>
  );
}

/**
 * The three painted stars over the window (`UiIcon` "star", the book's), the middle one larger and higher, in place of the score's
 * bar (the owner's ask of 2026-11-06): each fills with its gold from the left as the score reaches it (`fills`, 0 to 1 each, one
 * after the other), an empty one grey, its outline and its relief alone; a full one pops, with a sound and a buzz, and shines (the
 * book's halo behind it, `PrizeHalo`, and its glints twinkling); a partly filled one does not shine. At once under reduced motion or
 * `instant`, the glints still.
 */
export function EndStars({ stars, fills, instant, timing = END_STARS, className }: { stars: number; fills?: readonly number[]; instant?: boolean; timing?: { lead: number; gap: number }; className?: string }) {
  const reduced = useReducedMotionConfig() ?? false;
  const play = useSfx();
  const now = instant || reduced;
  const won = Math.min(Math.max(stars, 0), 3);
  const fill = (i: number) => (i < won ? 1 : Math.min(0.96, Math.max(0, fills?.[i] ?? 0)));
  // A star's turn: the first's lead, then one after the other.
  const at = (i: number) => timing.lead + i * timing.gap;
  useEffect(() => {
    if (won === 0) return;
    if (now) return;
    const timers = Array.from({ length: won }, (_, i) =>
      setTimeout(
        () => {
          play(i === 2 ? "wonder" : "place");
          haptic(i === 2 ? "firm" : "light");
        },
        (timing.lead + i * timing.gap + 0.3) * 1000,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [won, now, play, timing.lead, timing.gap]);
  return (
    <span role="img" aria-label={`${won} of 3 stars`} data-stars={won} data-testid="star-fill" className={cn("isolate flex items-end", className)}>
      {[0, 1, 2].map((i) => {
        const big = i === 1;
        return <FilledMark key={i} name="star" px={big ? 92 : 72} fill={fill(i)} at={at(i)} now={now} className={big ? "-mx-2 -translate-y-4" : undefined} />;
      })}
    </span>
  );
}

/** A painting that fills with its gold: a star of the ends, Training's crown. Its own alias, so the Font Awesome subset reads no name in it. */
type MarkArt = UiIconName;

/**
 * One painted mark `px` wide filling with its gold at its turn `at` (s): grey (its outline and its relief), its gold from the left up
 * to `fill` (0 to 1), and once full it pops, its light bursting in behind it (`StarLight`) and its glints twinkling (the ends' stars);
 * a partly filled one does not shine. At once when `now`.
 */
function FilledMark({ name, px, fill: f, at, now, className }: { name: MarkArt; px: number; fill: number; at: number; now: boolean; className?: string }) {
  const full = f >= 1;
  return (
    <span data-fill={Math.round(f * 100)} className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: px, height: px }}>
      {/* Its light bursts in as its gold reaches the end (the fill takes 0.35 s from its turn). */}
      {full && <StarLight px={px} delay={now ? 0 : at + 0.25} still={now} />}
      {/* The mark to win, grey: its outline and its relief. */}
      <span aria-hidden className="absolute inset-0" style={EMPTY_STAR}>
        <UiIcon name={name} px={px} className="size-full" />
      </span>
      {f > 0 && (
        // Its gold, from the left up to its share; a full one pops once filled.
        <m.span
          data-lit={full ? "" : undefined}
          className="absolute inset-0"
          initial={now ? false : { clipPath: "inset(0% 100% 0% 0%)" }}
          animate={{ clipPath: `inset(0% ${((1 - f) * 100).toFixed(1)}% 0% 0%)` }}
          transition={{ delay: now ? 0 : at, duration: now ? 0 : 0.35 * Math.max(f, 0.3), ease: "easeOut" }}
        >
          <m.span className="block size-full" initial={false} animate={full && !now ? { scale: [1, 1.25, 1] } : { scale: 1 }} transition={{ delay: at + 0.3, duration: 0.35, ease: "easeOut" }}>
            <UiIcon name={name} px={px} className="size-full" />
          </m.span>
        </m.span>
      )}
      {full && <Glints px={px} spots={STAR_GLINTS} delay={at + 0.3} still={now} />}
    </span>
  );
}

/**
 * One painted mark crowning the window in place of the three stars (TRAINING-END: Training's crown, the one mark of its score meter,
 * the device's best): the stars' middle place and size, filling with its gold as the score goes (`fill`, 0 to 1, the share of the mark's
 * goal), the first star's beat; `reached` (the goal beaten, never merely equalled: #1115), it fills and pops with the third star's sound
 * and buzz, its light and glints alive as theirs; short of it, a tie included, its gold stops short and nothing shines; grey with none.
 * At once under reduced motion or `instant`.
 */
export function EndMark({ name, fill, reached, label, instant, className }: { name: MarkArt; fill: number; reached: boolean; label: string; instant?: boolean; className?: string }) {
  const reduced = useReducedMotionConfig() ?? false;
  const play = useSfx();
  const now = Boolean(instant) || reduced;
  const f = reached ? 1 : Math.min(0.96, Math.max(0, fill));
  useEffect(() => {
    if (!reached || now) return;
    const timer = setTimeout(
      () => {
        play("wonder");
        haptic("firm");
      },
      (END_STARS.lead + 0.3) * 1000,
    );
    return () => clearTimeout(timer);
  }, [reached, now, play]);
  return (
    <span role="img" aria-label={label} data-reached={reached || undefined} data-testid="end-mark" className={cn("absolute -top-18 left-1/2 isolate flex -translate-x-1/2", className)}>
      <FilledMark name={name} px={92} fill={f} at={END_STARS.lead} now={now} />
    </span>
  );
}

/**
 * The crowns' row, the book's, on two lines: the painted crown, the crowns won (green) or lost; the crowns before and after and the
 * league's crest, a prize's light behind it when the attack carried the player into a higher league (the book's promotion, the
 * owner's ask of 2026-11-06). The change of league said to a reader (`moved`).
 */
export function CrownsRow({ crowns, after, league, promoted, moved }: { crowns: number; after: number; league?: ReactNode; promoted?: boolean; moved?: string }) {
  const sign = crowns > 0 ? "+" : crowns < 0 ? "−" : "±";
  return (
    <>
      <UiIcon name="crown" px={80} className="drawer-icon size-20 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          role="img"
          aria-label={`${crowns < 0 ? "-" : crowns > 0 ? "+" : ""}${formatInteger(Math.abs(crowns))} ${Math.abs(crowns) === 1 ? "crown" : "crowns"}`}
          className={cn("text-outline text-4xl leading-none font-bold tabular-nums", crowns > 0 ? "text-success" : crowns < 0 ? "text-warning" : "text-muted-foreground")}
        >
          {sign}
          {formatInteger(Math.abs(crowns))}
        </span>
        <span className="flex items-center gap-2 text-lg font-bold text-muted-foreground">
          <span className="text-outline tabular-nums">
            {formatInteger(after - crowns)} → {formatInteger(after)}
          </span>
          {league && (
            <span data-promoted={promoted || undefined} className="relative isolate inline-grid place-items-center">
              {promoted && <PrizeHalo px={92} delay={0.6} />}
              {league}
            </span>
          )}
          {moved && <span className="sr-only">{moved}</span>}
        </span>
      </span>
    </>
  );
}

/**
 * The XP's row, the book's: the HUD's blue star holding the level, large; "+20 XP" and the level's bar, the Profile's own (`LevelBar`,
 * the owner's ask of 2026-11-06: the same style), its star left to the large one; a level up said.
 */
export function XpRow({ gained, progress, levelUp }: { gained: number; progress: PlayerProgress | undefined; levelUp?: boolean }) {
  const level = progress?.level ?? null;
  const pct = progress ? Math.round((progress.xpForNext > 0 ? Math.min(1, progress.xp / progress.xpForNext) : 1) * 100) : 0;
  return (
    <>
      <span role="img" aria-label={level == null ? "Level" : `Level ${formatInteger(level)}`} className="relative grid size-18 shrink-0 place-items-center">
        <UiIcon name="level-star" px={72} className="drawer-icon absolute inset-0 size-full" />
        <span aria-hidden className="text-outline relative text-2xl leading-none font-black text-foreground">
          {level == null ? "…" : level > 99 ? "99+" : formatInteger(level)}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline gap-2">
          <span className="text-outline text-3xl leading-none font-bold text-foreground tabular-nums">+{formatInteger(gained)} XP</span>
          {levelUp && <span className="text-outline text-sm font-black text-primary">Level up!</span>}
        </span>
        <span role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="block w-full">
          <LevelBar progress={progress} variant="profile" star={false} />
        </span>
      </span>
    </>
  );
}

/**
 * The chest's panel on a game's end (END-CHEST): won, the book's gold panel, its chest shaking over "Tap to open" (a tap opens it in
 * the reveal, `ChestModal`); opening, the chest over "Opening…"; loading, the same panel disabled over "Loading…"; a failed read, its
 * message and Retry (`InlineError`); unavailable, carved, the chest's icon grey and no chests on the network; kept, carved, the tile taken and its name (or the chest's icon, grey);
 * capped, carved, the chest's icon grey, no slot left today and the slots' reset counting down in a carved chip (the Missions'
 * resets'). The reveal is the caller's.
 */
export function EndChestPanel({ chest, now, tileArt, onOpen }: { chest: EndChest; now: number; tileArt?: TileArt; onOpen?: () => void }) {
  const reduced = useReducedMotionConfig() ?? false;
  if (chest.state === "none") return null;
  const name = CHEST_NAME[chest.rank];
  if (chest.state === "error") {
    return (
      <InlineError
        title={`Could not load your ${name.toLowerCase()}`}
        message={chest.message}
        detail={chest.detail}
        action={
          chest.onRetry && (
            <Button size="sm" variant="outline" loading={chest.retrying} onClick={chest.onRetry}>
              Retry
            </Button>
          )
        }
        className="w-full"
      />
    );
  }
  if (chest.state === "won" || chest.state === "opening" || chest.state === "loading") {
    // Opening (its draw on its way) or loading (the chests' read not there yet): disabled until the chest can be opened.
    const busy = chest.state !== "won";
    return (
      <button
        type="button"
        aria-label={chest.state === "opening" ? `${name}: opening` : chest.state === "loading" ? `${name}: loading` : `Open the ${name.toLowerCase()}`}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={onOpen}
        style={GOLD_SOFT}
        data-chest={chest.state}
        className="state-layer relative isolate flex w-full flex-col items-center gap-1 overflow-hidden rounded-2xl px-3 pt-2 pb-3 outline-none disabled:opacity-100"
      >
        {/* The chest's shine, the stars' (the owner's note of 2026-11-06): the gold halo behind it and sparkles round it. */}
        <span className="relative isolate grid h-28 w-32 place-items-center">
          <PrizeHalo px={CHEST_PX * 1.9} delay={0.2} />
          <LazyChestArt rank={chest.rank} state="ready" size="md" label={null} />
          <Glints px={CHEST_PX} spots={CHEST_GLINTS} delay={0.4} still={reduced} />
        </span>
        <span className="text-outline text-lg font-bold text-foreground italic">{chest.state === "opening" ? "Opening…" : chest.state === "loading" ? "Loading…" : "Tap to open"}</span>
      </button>
    );
  }
  if (chest.state === "kept") {
    return (
      <section aria-label={name} data-chest="kept" className="drawer-carved flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left">
        {chest.plan != null ? (
          <span className="block size-14 shrink-0">
            <TilePicture plan={chest.plan} art={tileArt} />
          </span>
        ) : (
          <span className="grid size-14 shrink-0 place-items-center" style={CHEST_SPENT}>
            <ChestIcon rank={chest.rank} size="xl" label={null} />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-outline text-base leading-tight font-bold">{chest.plan != null ? "Added to your inventory" : `${name} opened`}</span>
          {chest.plan != null && <span className="text-sm font-semibold text-muted-foreground">{tileName(chest.plan)}</span>}
        </span>
      </section>
    );
  }
  if (chest.state === "already" || chest.state === "missed") {
    // A Story level's chest this run did not win (STORY-PAGE): carved, the chest's icon grey, and why.
    const already = chest.state === "already";
    return (
      <section aria-label={name} data-chest={chest.state} className="drawer-carved flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left">
        <span className="grid size-14 shrink-0 place-items-center" style={CHEST_SPENT}>
          <ChestIcon rank={chest.rank} size="xl" label={null} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="text-outline text-base leading-tight font-bold text-muted-foreground">{already ? "Chest already won" : "No chest this time"}</span>
          <span className="text-xs font-semibold text-muted-foreground">
            {already ? `This level's ${name.toLowerCase()} is yours.` : `3 stars win this level's ${name.toLowerCase()}.`}
          </span>
        </span>
      </section>
    );
  }
  if (chest.state === "unavailable") {
    return (
      <section aria-label={name} aria-disabled data-chest="unavailable" className="drawer-carved flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left">
        <span className="grid size-14 shrink-0 place-items-center" style={CHEST_SPENT}>
          <ChestIcon rank={chest.rank} size="xl" label={null} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="text-outline text-base leading-tight font-bold text-muted-foreground">No chests here yet</span>
          <span className="text-xs font-semibold text-muted-foreground">Chests are not on this network yet.</span>
        </span>
      </section>
    );
  }
  return (
    <section aria-label={name} aria-disabled data-chest="capped" className="drawer-carved flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left">
      <span className="grid size-14 shrink-0 place-items-center" style={CHEST_SPENT}>
        <ChestIcon rank={chest.rank} size="xl" label={null} />
      </span>
      {chest.resetsAt > now ? (
        <>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <span className="text-outline text-base leading-tight font-bold text-muted-foreground">No slot left today</span>
            <span className="text-xs font-semibold text-muted-foreground">Today's 3 PvP chests are won.</span>
          </span>
          <Countdown expiresAt={chest.resetsAt} now={now} label="Slots reset in" short className="drawer-carved h-7 shrink-0 rounded-full px-2.5 text-foreground" />
        </>
      ) : (
        // Past its deadline (a result opened later): the slots are back.
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="text-outline text-base leading-tight font-bold text-muted-foreground">No slot was left that day</span>
          <span className="text-xs font-semibold text-muted-foreground">Your chest slots are open again.</span>
        </span>
      )}
    </section>
  );
}
