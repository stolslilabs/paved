import type { CSSProperties, ReactNode } from "react";
import type { GameView } from "@paved/chain";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { formatShortRemaining } from "../elements/countdown";
import { modeIconSources, modeSceneSources, type PlayMode } from "../elements/play-art";
import { formatPoints } from "../elements/score";
import { TokenIcon } from "../elements/token-icon";
import { uiFrameImageSet } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";

/** The player's Challenge game still open (`useActiveGame`): what its card shows and resumes. */
export type RunningChallenge = Pick<GameView, "id" | "score" | "expiresAt">;

/** The Puzzle's card (Play's Limited mode): today's time left, the player's best and place, their game still open. */
export interface PuzzleCard {
  /** When the day ends, in seconds since the epoch: the corner's time left. */
  endsAt: number;
  /** The player's best of today and its place, 1 first; null: no result today. */
  best: { score: number; place: number } | null;
  /** The player's game of today still open: its score (a tap opens the game). Null: none. */
  playing: { score: number } | null;
}

/** Under this many seconds left, the Puzzle's time turns amber. */
export const PUZZLE_LATE_S = 3_600;

export interface PlayModesProps {
  /** `Challenge.spawn_paused`: no Challenge bought. */
  spawnPaused: boolean;
  /** The Challenge game still open: its time left, its score and Resume on the Challenge's card. Null or omitted: none. */
  running?: RunningChallenge | null;
  /** Seconds since the epoch, the chain's clock: the running game's time left. */
  now?: number;
  onChallenge?: () => void;
  onResume?: (gameId: number) => void;
  onTraining?: () => void;
  onStory?: () => void;
  /** The PvP attack (#647, #740): a rival village. Omitted: no Attack. */
  onAttack?: () => void;
  /** The Puzzle's card (Limited); null or omitted: the Puzzle is not on this network, "Coming soon". */
  puzzleCard?: PuzzleCard | null;
  /** A tap on the Puzzle's card: its view, or the game still open. */
  onPuzzle?: () => void;
}

/** A mode's icon (PLAY-MODES): one object, used nowhere else; decorative, the card's words name the mode. `px` its drawn width. */
export function ModeIcon({ mode, px, className, style }: { mode: PlayMode; px: number; className?: string; style?: CSSProperties }) {
  return <img {...modeIconSources(mode, px)} alt="" aria-hidden draggable={false} decoding="async" style={style} className={cn("pointer-events-none h-auto shrink-0", className)} />;
}

/** What a mode can win: the HUD's own icons. */
type Reward = "paved" | "crown" | "cobbles" | "xp" | "chest";
const REWARD_NAMES: Record<Reward, string> = { paved: "PAVED", crown: "crowns", cobbles: "Cobbles", xp: "XP", chest: "chests" };

/** The rewards' shadow on a scene: the HUD's outline under each icon. */
const ON_SCENE = "[filter:drop-shadow(0_2px_0_var(--hud-outline))]";

/**
 * A reward's icon, 28 px: the PAVED coin, the crown, the Cobbles' paving stone, the dock's chest; the level bar's blue star with "XP"
 * in it, as the HUD's `LevelStar` (#1065), a little larger in the same box.
 */
function RewardIcon({ reward }: { reward: Reward }) {
  if (reward === "paved") return <TokenIcon kind="paved" size="md" className={cn("size-7", ON_SCENE)} px={28} />;
  if (reward === "cobbles") return <TokenIcon kind="cobbles" size="md" className={cn("size-7", ON_SCENE)} px={28} />;
  if (reward === "xp")
    return (
      <span className="relative -m-0.5 grid size-8 shrink-0 place-items-center">
        <UiIcon name="level-star" px={32} className={cn("absolute inset-0 size-full", ON_SCENE)} />
        <span className="text-outline relative text-xs leading-none font-bold text-foreground tabular-nums">XP</span>
      </span>
    );
  if (reward === "crown") return <UiIcon name="crown" px={28} className={cn("size-7", ON_SCENE)} />;
  return <UiIcon name="chests" px={28} className={cn("size-7", ON_SCENE)} />;
}

/**
 * A mode's prize, static (the owner's ask of 2026-11-08, direction C): its rewards' icons side by side in the card's bottom-right
 * corner, the mode's own first (PAVED, crowns, Cobbles), then XP and the chests; a column on a square card. Named for a screen reader
 * by its rewards. It takes no tap (`pointer-events-none`): drawn above the card's stretched button, a tap on it reaches that button
 * (#1041).
 */
function Rewards({ rewards, column = false, className }: { rewards: readonly Reward[]; column?: boolean; className?: string }) {
  return (
    <span role="img" aria-label={`Rewards: ${rewards.map((r) => REWARD_NAMES[r]).join(", ")}`} className={cn("pointer-events-none absolute flex items-center gap-0.5", column && "flex-col", className)}>
      {rewards.map((reward) => (
        <RewardIcon key={reward} reward={reward} />
      ))}
    </span>
  );
}

/** Each mode's own reward first, then XP and the chests, which every mode but the Puzzle pays. */
const CHALLENGE_REWARDS: readonly Reward[] = ["paved", "xp", "chest"];
const ATTACK_REWARDS: readonly Reward[] = ["crown", "xp", "chest"];
/** Story pays Cobbles for its stars (#548, `docs/client/story-mode.md`). */
const STORY_REWARDS: readonly Reward[] = ["cobbles", "xp", "chest"];
/** The Puzzle pays its day's first place Cobbles, and nothing else: no XP, no chest. */
const PUZZLE_REWARDS: readonly Reward[] = ["cobbles"];

/**
 * The slabs' outlines (the owner's direction C): each card a stone slab, no two corners alike, a notch or a chip on an edge. Polygons
 * for `clip-path`, drawn once on the frame (the HUD's outline) and again 3 px inside it on the scene, so the frame is a 3 px border
 * that follows every cut.
 */
const SHAPES = {
  attack: "polygon(18px 0, 58% 0, 61% 5px, calc(100% - 6px) 0, 100% 8px, 100% calc(100% - 22px), calc(100% - 16px) 100%, 34% 100%, 31% calc(100% - 4px), 4px 100%, 0 calc(100% - 6px), 0 16px)",
  challenge: "polygon(0 10px, 10px 0, calc(100% - 22px) 0, 100% 14px, 100% 100%, 64% 100%, 61% calc(100% - 4px), 12px calc(100% - 2px), 0 calc(100% - 12px))",
  training: "polygon(14px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 46%, 3px 42%, 0 38%, 0 14px)",
  story: "polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 26px 100%, 0 calc(100% - 6px), 2px 60%, 0 55%)",
  puzzle: "polygon(8px 0, 40% 0, 42% 4px, 100% 2px, 100% 100%, 16px 100%, 0 calc(100% - 16px), 0 8px)",
} as const satisfies Record<PlayMode, string>;

/** The scene darkened under the words: from the foot (the cards whose title sits at the bottom), or from the left (the Puzzle's). */
const SHADE_UP: CSSProperties = { backgroundImage: "linear-gradient(180deg, transparent 35%, color-mix(in oklab, var(--card) 90%, transparent))" };
const SHADE_LEFT: CSSProperties = { backgroundImage: "linear-gradient(90deg, color-mix(in oklab, var(--card) 85%, transparent) 20%, color-mix(in oklab, var(--card) 10%, transparent) 70%)" };

/**
 * A mode's card (PLAY-MODES): its slab (`SHAPES`), its scene filling it (`sceneAt` its crop, `scenePx` the width it is drawn), the
 * scene darkened under the words, a light bevel along its top, and its icon breaking out of its top edge (`icon`). The card's whole
 * face is its button (`COVER`, `after:inset-0`); hovered or pressed, the scene takes the state layer, inside the slab's cut. The slab
 * is drawn under the card's words (`-z-*` in the card's own stacking context, `isolate`), the words being in the flow.
 */
function ModeCard({ mode, sceneAt, scenePx, shade = SHADE_UP, icon, disabled = false, slot, className, children }: { mode: PlayMode; sceneAt: string; scenePx: number; shade?: CSSProperties; icon: { px: number; style: CSSProperties }; disabled?: boolean; slot?: string; className?: string; children: ReactNode }) {
  return (
    <div data-slot={slot ?? "play-card"} data-mode={mode} aria-disabled={disabled || undefined} style={{ "--shape": SHAPES[mode] } as CSSProperties} className={cn("group/card relative isolate flex", disabled && "opacity-60", className)}>
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-20 [filter:drop-shadow(0_2px_0_var(--hud-outline))]">
        <span className="absolute inset-0 bg-(--hud-outline) [clip-path:var(--shape)]" />
      </span>
      <span aria-hidden className="pointer-events-none absolute inset-[3px] -z-10 overflow-hidden bg-secondary [clip-path:var(--shape)]">
        <img {...modeSceneSources(mode, scenePx)} alt="" draggable={false} decoding="async" className={cn("absolute inset-0 size-full object-cover", disabled && "grayscale")} style={{ objectPosition: sceneAt }} />
        <span className="absolute inset-0" style={shade} />
        <span className="absolute inset-x-0 top-0 h-0.5 bg-foreground/30" />
        {!disabled && <span className="absolute inset-0 group-hover/card:bg-(--state-hover) group-active/card:bg-(--state-pressed)" />}
      </span>
      <ModeIcon mode={mode} px={icon.px} className={cn("absolute z-10 [filter:drop-shadow(0_3px_0_var(--hud-outline))]", disabled && "grayscale")} style={{ width: icon.px, ...icon.style }} />
      {children}
    </div>
  );
}

/**
 * A card's group, as a tag on its scene (Ranked, Paid, Free, Limited): the groups' titles left the page with direction C, the tag
 * says it (hidden from a screen reader, which reads each group's own title).
 */
function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span aria-hidden className={cn("text-outline pointer-events-none w-fit rounded-[0.4375rem] bg-background/80 px-2 py-px text-xs leading-4 font-extrabold tracking-widest uppercase", className)}>{children}</span>;
}

/** The card's whole face is its button (`after:inset-0`); what sits over it (Resume) is lifted above that layer. */
const COVER = "flex min-w-0 cursor-pointer flex-col items-start gap-0.5 self-end text-left after:absolute after:inset-0 after:z-0 disabled:cursor-not-allowed";
/** The cards' titles, the display face over the scene, by the card's size. */
const TITLE = "text-outline font-display leading-none font-bold";
/** A card's line under its title. */
const LINE = "text-outline text-[0.8125rem] leading-tight font-semibold text-foreground/90";
/** Resume on the book's gold pill (edit mode's Use, `gold-pill` in theme.css), its image the HUD frame `save-pill`. */
const SAVE_PILL = { "--save-pill": uiFrameImageSet("save-pill") } as CSSProperties;

/** The scenes' drawn widths: a wide card's width on a phone (about 358 px), a square's height times 1.5 (186 px tall). */
const WIDE_PX = 380;
const SQUARE_PX = 280;

/**
 * The Play page's modes (PLAY-PAGE, then PLAY-MODES: the owner's direction C of 2026-11-08), a game menu more than a list: Attack the
 * hero, the Challenge wide, Training and Story two square tiles side by side, the Puzzle wide. Every card a stone slab in a painted
 * scene of its mode, its icon breaking out of its top edge, its group as a tag (the groups' titles kept for a screen reader). Attack
 * (Ranked): the catapult, "Raid a rival village", its rewards: crowns, XP and chests. The Challenge (Paid): the war horn, "Beat the
 * threshold", its rewards: PAVED, XP and chests; with a game still open, its time left and its score as its line, Resume in
 * the rewards' place ("modes-resume"). Training (Free): the straw dummy and its line. Story (Free): the map, its line and its rewards in a column:
 * Cobbles, XP and chests. The Puzzle (Limited, `PuzzleMode`): the jigsaw tile, the day's deck for every player, its first place paid
 * in Cobbles; "Coming soon" where the network has no Puzzle. No Connect (NO-GUEST: every player has an account); a pause turns the
 * Challenge off and says why. The rewards are static.
 */
export function PlayModes({ spawnPaused, running = null, now = 0, onChallenge, onResume, onTraining, onStory, onAttack, puzzleCard = null, onPuzzle }: PlayModesProps) {
  const left = running ? running.expiresAt - now : 0;
  return (
    <div data-slot="play-modes" className="flex flex-col gap-3.5 pt-5">
      {onAttack && (
        <section aria-labelledby="play-ranked">
          <h3 id="play-ranked" className="sr-only">
            Ranked
          </h3>
          <ModeCard mode="attack" sceneAt="70% 50%" scenePx={WIDE_PX} icon={{ px: 116, style: { left: 6, top: -22 } }} className="h-52.5 p-3.5 pb-3">
            <Chip className="absolute top-2.5 right-3">Ranked</Chip>
            <button type="button" onClick={onAttack} className={COVER}>
              <span className={cn(TITLE, "text-[2.125rem]")}>Attack</span>
              <span className={LINE}>Raid a rival village</span>
            </button>
            <Rewards rewards={ATTACK_REWARDS} className="right-3.5 bottom-3.5" />
          </ModeCard>
        </section>
      )}

      <section aria-labelledby="play-paid">
        <h3 id="play-paid" className="sr-only">
          Paid
        </h3>
        <ModeCard mode="challenge" sceneAt="50% 68%" scenePx={WIDE_PX} icon={{ px: 92, style: { right: 8, top: -20 } }} disabled={spawnPaused} className="h-29 gap-2 p-3.5 pb-3">
          <Chip className="absolute top-2.5 left-3">Paid</Chip>
          <button type="button" disabled={spawnPaused} onClick={onChallenge} className={cn(COVER, "flex-1")}>
            <span className={cn(TITLE, "text-[1.75rem]")}>Challenge</span>
            {running ? (
              <span className="text-outline flex flex-wrap items-center gap-x-2 text-[0.8125rem] leading-tight font-bold">
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Icon name="clock" size="sm" />
                  {left > 0 ? (
                    <span>
                      <span className="numeric">{formatShortRemaining(left)}</span> left
                    </span>
                  ) : (
                    "Expired"
                  )}
                </span>
                <span className="flex items-center gap-1 whitespace-nowrap" aria-label={`Score ${formatPoints(running.score)}`}>
                  <UiIcon name="star" px={16} className="size-4" />
                  <span className="numeric">{formatPoints(running.score)}</span>
                </span>
              </span>
            ) : (
              <span className={LINE}>Beat the threshold</span>
            )}
            {spawnPaused && <span className="text-outline text-sm text-warning">Purchases are paused for now.</span>}
          </button>
          {running ? (
            // The 36 px pill in its 44 px target (`-my-1` keeps the card's line).
            <button type="button" onClick={() => onResume?.(running.id)} aria-label={`Resume Challenge #${running.id}`} className="relative z-10 -my-1 grid h-11 shrink-0 cursor-pointer place-items-center self-end rounded-lg">
              <span style={SAVE_PILL} className="gold-pill grid h-9 place-items-center rounded-lg px-3 text-base">
                Resume
              </span>
            </button>
          ) : (
            <Rewards rewards={CHALLENGE_REWARDS} className="right-3.5 bottom-3" />
          )}
        </ModeCard>
      </section>

      <section aria-labelledby="play-free" className="grid grid-cols-2 gap-3 pt-3">
        <h3 id="play-free" className="sr-only">
          Free
        </h3>
        <ModeCard mode="training" sceneAt="62% 50%" scenePx={SQUARE_PX} icon={{ px: 92, style: { left: "50%", top: -18, transform: "translateX(-50%)" } }} className="h-46.5 p-3 pb-3">
          <div className="flex flex-col items-start gap-1 self-end">
            <Chip>Free</Chip>
            <button type="button" onClick={onTraining} className={COVER}>
              <span className={cn(TITLE, "text-[1.625rem]")}>Training</span>
              <span className={LINE}>A full game, just for practice</span>
            </button>
          </div>
        </ModeCard>
        <ModeCard mode="story" sceneAt="82% 40%" scenePx={SQUARE_PX} icon={{ px: 92, style: { left: "50%", top: -18, transform: "translateX(-50%)" } }} className="h-46.5 p-3 pr-10 pb-3">
          <div className="flex flex-col items-start gap-1 self-end">
            <Chip>Free</Chip>
            <button type="button" onClick={onStory} className={COVER}>
              <span className={cn(TITLE, "text-[1.625rem]")}>Story</span>
              <span className={LINE}>Learn and play fun levels</span>
            </button>
          </div>
          <Rewards rewards={STORY_REWARDS} column className="right-2 bottom-3" />
        </ModeCard>
      </section>

      <section aria-labelledby="play-limited" className="pt-2">
        <h3 id="play-limited" className="sr-only">
          Limited
        </h3>
        {puzzleCard ? (
          <PuzzleMode card={puzzleCard} now={now} onSelect={onPuzzle} />
        ) : (
          <ModeCard mode="puzzle" sceneAt="55% 50%" scenePx={WIDE_PX} shade={SHADE_LEFT} icon={{ px: 76, style: { right: 14, top: -16 } }} disabled className="h-29">
            <button type="button" disabled className="absolute inset-0 flex cursor-not-allowed items-center justify-center gap-3">
              <UiIcon name="padlock" px={32} className="size-8 [filter:drop-shadow(0_2px_0_var(--hud-outline))]" />
              <span className="text-outline font-display text-2xl font-bold">Coming soon</span>
            </button>
          </ModeCard>
        )}
      </section>
    </div>
  );
}

/** The player's place of the day beside a title: "#28", carved, the same for every place (the owner's ask). */
export function PuzzleRank({ place, className }: { place: number; className?: string }) {
  return (
    <span aria-label={`Place ${formatPoints(place)} today`} className={cn("drawer-carved numeric shrink-0 rounded-md px-1.5 text-[0.8125rem] leading-5 font-extrabold text-foreground", className)}>
      #{formatPoints(place)}
    </span>
  );
}

/** A day's time left, as the card's corner and the view show it: "5h 12m", "38m". */
export const puzzleTimeLeft = (endsAt: number, now: number): string => formatShortRemaining(Math.max(0, endsAt - now));

/**
 * The Puzzle's card (Limited, the owner's asks of 2026-11-08), a wide slab on its scene darkened from the left, the jigsaw tile
 * breaking out at its right. "Puzzle" and the player's place of the day beside it (carved, "#28", no total), then the line: "One deck
 * for all" until they play, their best of the day (PB) once they have one, their game's score while one is open (a tap then opens
 * it). Its reward at its end, the Cobbles alone; the day's time left in a carved tab in its bottom-right corner, amber under an hour.
 */
function PuzzleMode({ card, now, onSelect }: { card: PuzzleCard; now: number; onSelect?: () => void }) {
  const left = card.endsAt - now;
  const line = card.playing ? (
    <span className="text-outline flex items-center gap-1 text-base leading-tight font-bold">
      <UiIcon name="star" px={20} className="size-5" />
      <span className="numeric">{formatPoints(card.playing.score)}</span>
      <span className="text-[0.8125rem] font-semibold text-foreground/90">in play</span>
    </span>
  ) : card.best ? (
    <span className="text-outline flex items-center gap-1 text-base leading-tight font-bold">
      <UiIcon name="star" px={20} className="size-5" />
      <span className="numeric">{formatPoints(card.best.score)}</span>
      <span className="text-[0.8125rem] font-semibold text-foreground/90">PB</span>
    </span>
  ) : (
    <span className={LINE}>One deck for all</span>
  );
  return (
    <ModeCard mode="puzzle" slot="puzzle-card" sceneAt="55% 50%" scenePx={WIDE_PX} shade={SHADE_LEFT} icon={{ px: 76, style: { right: 14, top: -16 } }} className="h-29 p-3.5 pb-3">
      <Chip className="absolute top-2.5 left-3">Limited</Chip>
      <button type="button" onClick={onSelect} aria-label={card.playing ? `Puzzle: resume your game, ${formatPoints(card.playing.score)} points` : "Puzzle"} className={cn(COVER, "flex-1")}>
        <span className="flex items-center gap-2">
          <span className={cn(TITLE, "text-[1.75rem]")}>Puzzle</span>
          {card.best && <PuzzleRank place={card.best.place} />}
        </span>
        {line}
      </button>
      <Rewards rewards={PUZZLE_REWARDS} className="right-3 bottom-8" />
      <span
        role="timer"
        aria-label={`${puzzleTimeLeft(card.endsAt, now)} left today`}
        className={cn(
          "text-outline pointer-events-none absolute right-[3px] bottom-[3px] z-10 flex h-5.5 items-center gap-1 rounded-tl-[0.5625rem] bg-card pr-2.5 pl-1.5 font-mono text-xs font-bold",
          left < PUZZLE_LATE_S && "text-warning",
        )}
      >
        <UiIcon name="countdown" px={14} className="size-3.5" />
        <span className="numeric">{puzzleTimeLeft(card.endsAt, now)}</span>
      </span>
    </ModeCard>
  );
}
