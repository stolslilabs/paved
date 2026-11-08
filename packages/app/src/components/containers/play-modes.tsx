import type { CSSProperties } from "react";
import * as m from "motion/react-m";
import type { GameView } from "@paved/chain";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { formatShortRemaining } from "../elements/countdown";
import { playArtSources, type PlayArtName } from "../elements/play-art";
import { formatPoints } from "../elements/score";
import { SectionTitle } from "../elements/section-title";
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

/**
 * A mode's painting, its foot on the frame's: decorative, the card's words name it. `px` is its width from `mobile` (360 px); `className`
 * its width (a phone under 360 px draws it smaller, so a card's title and rewards keep their room).
 */
function ModeArt({ name, px, className }: { name: PlayArtName; px: number; className: string }) {
  return <img {...playArtSources(name, px)} alt="" draggable={false} decoding="async" className={cn("h-auto shrink-0", className)} />;
}
/** The paintings of the cards and of the Free rows, one size, smaller under 360 px. */
const CARD_ART = "w-18 mobile:w-24";
/** The cards' and rows' titles, a step smaller under 360 px. */
const TITLE = "text-outline text-lg leading-tight font-bold mobile:text-xl";

/** What a mode can win: the HUD's own icons. */
type Reward = "paved" | "crown" | "cobbles" | "xp" | "chest";
const REWARD_NAMES: Record<Reward, string> = { paved: "PAVED", crown: "crowns", cobbles: "Cobbles", xp: "XP", chest: "chests" };

/**
 * A reward's icon, 36 px: the PAVED coin, the crown, the Cobbles' paving stone, the dock's chest; the level bar's blue star with "XP" in
 * it 40 px, as the HUD's `LevelStar` (#1065), in the same 36 px box.
 */
function RewardIcon({ reward }: { reward: Reward }) {
  if (reward === "paved") return <TokenIcon kind="paved" size="lg" className="drawer-icon size-9" px={36} />;
  if (reward === "cobbles") return <TokenIcon kind="cobbles" size="lg" className="drawer-icon size-9" px={36} />;
  if (reward === "xp")
    return (
      <span className="relative -m-0.5 grid size-10 shrink-0 place-items-center">
        <UiIcon name="level-star" px={40} className="absolute inset-0 size-full [filter:drop-shadow(0_1px_0_var(--background))]" />
        <span className="text-outline relative text-sm leading-none font-bold text-foreground tabular-nums">XP</span>
      </span>
    );
  if (reward === "crown") return <UiIcon name="crown" px={36} className="drawer-icon size-9" />;
  return <UiIcon name="chests" px={36} className="drawer-icon size-9" />;
}

/** The box the rewards fill at a mode's end: the open gift's (left on the owner's ask of 2026-11-08), so no card moves. */
const REWARDS_BOX: CSSProperties = { width: "4.75rem", height: "4.25rem" };

/**
 * A mode's prize (the owner's asks of 2026-11-06, in place of the book's tags, then of 2026-11-08: the gift under them removed, the
 * icons alone filling its place): the rewards' icons in a pile, the mode's own first and on top (PAVED, crowns, Cobbles), XP and the
 * chests side by side under it, the same at every width; two or one side by side. Upright (the fan's tilt left with the gift, the XP
 * reads level), each bobbing in turn, still under reduced motion (`MotionConfig`). Named for a screen reader by its rewards. It takes
 * no tap (`pointer-events-none`): drawn above the card's stretched button, a tap on it reaches that button (#1041).
 */
function Rewards({ rewards, className }: { rewards: readonly Reward[]; className?: string }) {
  const rows = rewards.length > 2 ? [rewards.slice(0, 1), rewards.slice(1)] : [rewards];
  return (
    <span role="img" aria-label={`Rewards: ${rewards.map((r) => REWARD_NAMES[r]).join(", ")}`} style={REWARDS_BOX} className={cn("pointer-events-none ml-auto flex shrink-0 flex-col items-center justify-center", className)}>
      {rows.map((row, r) => (
        <span key={row.join()} className={cn("flex", r > 0 && "-mt-2")}>
          {row.map((reward) => (
            <m.span key={reward} className="block" animate={{ y: [0, -3, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: rewards.indexOf(reward) * 0.25, repeatDelay: 0.6 }}>
              <RewardIcon reward={reward} />
            </m.span>
          ))}
        </span>
      ))}
    </span>
  );
}

/** Each mode's own reward first (the pile's top), then XP and the chests, which every mode pays. */
const CHALLENGE_REWARDS: readonly Reward[] = ["paved", "xp", "chest"];
const ATTACK_REWARDS: readonly Reward[] = ["crown", "xp", "chest"];
/** Story pays Cobbles for its stars (#548, `docs/client/story-mode.md`). */
const STORY_REWARDS: readonly Reward[] = ["cobbles", "xp", "chest"];
/** The Puzzle pays its day's first place Cobbles, and nothing else: no XP, no chest. */
const PUZZLE_REWARDS: readonly Reward[] = ["cobbles"];

/** The card's whole face is its button (`after:inset-0`); what sits over it (Resume) is lifted above that layer. */
const COVER = "flex min-w-0 cursor-pointer flex-col text-left after:absolute after:inset-0 disabled:cursor-not-allowed";
/** The soft rule between the Free card's rows, the Shop's: the bevel's grey, half see-through. */
const RULE: CSSProperties = { borderTop: "1px solid color-mix(in oklab, var(--drawer-bevel) 45%, transparent)" };
/** Resume on the book's gold pill (edit mode's Use, `gold-pill` in theme.css), its image the HUD frame `save-pill`. */
const SAVE_PILL = { "--save-pill": uiFrameImageSet("save-pill") } as CSSProperties;

/**
 * The Play page's modes (PLAY-PAGE, the Paved UX Book's "modes", then the owner's asks of 2026-11-06), four groups under their painted
 * titles, every card raised alike (the Challenge's gold fill left on the owner's ask). Ranked (the crown) first: Attack, its castle and
 * crossed swords, "Raid a rival village", its rewards: crowns, XP and chests. Paid (PAVED's coin): the Challenge, its trophy, "Beat
 * the threshold", its rewards: PAVED, XP and chests; with a game still open, its time left, its score and Resume in their place
 * ("modes-resume"). Free (the leaf): one raised card, a soft rule between its rows: Training and its line, Story and its line with its
 * rewards: Cobbles, XP and chests. Limited (the season's calendar): the Puzzle (`PuzzleMode`), the day's deck for every player, its
 * first place paid in Cobbles; "Coming soon" where the network has no Puzzle. No Connect (NO-GUEST: every player has an account); a
 * pause turns the Challenge off and says why.
 */
export function PlayModes({ spawnPaused, running = null, now = 0, onChallenge, onResume, onTraining, onStory, onAttack, puzzleCard = null, onPuzzle }: PlayModesProps) {
  const left = running ? running.expiresAt - now : 0;
  return (
    <>
      {onAttack && (
        <section aria-labelledby="play-ranked" className="flex flex-col gap-2">
          <SectionTitle id="play-ranked">
            <UiIcon name="crown" px={28} className="drawer-icon size-7 self-center" />
            Ranked
          </SectionTitle>
          <div className="drawer-tile state-layer relative flex items-center gap-2 rounded-2xl p-2 pr-3">
            <ModeArt name="attack" px={96} className={CARD_ART} />
            <button type="button" onClick={onAttack} className={cn(COVER, "flex-1")}>
              <span className={TITLE}>Attack</span>
              <span className="text-sm font-semibold text-muted-foreground">Raid a rival village</span>
            </button>
            <Rewards rewards={ATTACK_REWARDS} />
          </div>
        </section>
      )}

      <section aria-labelledby="play-paid" className="flex flex-col gap-2">
        <SectionTitle id="play-paid">
          <TokenIcon kind="paved" size="md" className="self-center" />
          Paid
        </SectionTitle>
        <div aria-disabled={spawnPaused || undefined} className={cn("drawer-tile relative flex items-center gap-2 rounded-2xl p-2 pr-3", spawnPaused ? "opacity-60" : "state-layer")}>
          <ModeArt name="challenge" px={96} className={CARD_ART} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <button type="button" disabled={spawnPaused} onClick={onChallenge} className={COVER}>
              <span className={TITLE}>Challenge</span>
              <span className="text-sm font-semibold text-muted-foreground">Beat the threshold</span>
              {spawnPaused && <span className="text-sm text-warning">Purchases are paused for now.</span>}
            </button>
            {running && (
              <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-outline flex flex-col font-bold">
                  <span className="flex items-center gap-1 text-sm whitespace-nowrap">
                    <Icon name="clock" size="sm" />
                    {left > 0 ? (
                      <span>
                        <span className="numeric">{formatShortRemaining(left)}</span> left
                      </span>
                    ) : (
                      "Expired"
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-lg leading-tight" aria-label={`Score ${formatPoints(running.score)}`}>
                    <UiIcon name="star" px={24} className="drawer-icon size-6" />
                    <span className="numeric">{formatPoints(running.score)}</span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onResume?.(running.id)}
                  aria-label={`Resume Challenge #${running.id}`}
                  style={SAVE_PILL}
                  className="gold-pill ml-auto h-11 shrink-0 cursor-pointer rounded-lg px-3 text-base"
                >
                  Resume
                </button>
              </div>
            )}
          </div>
          {!running && <Rewards rewards={CHALLENGE_REWARDS} />}
        </div>
      </section>

      <section aria-labelledby="play-free" className="flex flex-col gap-2">
        <SectionTitle id="play-free">
          <UiIcon name="theme-forest" px={28} className="drawer-icon size-7 self-center" />
          Free
        </SectionTitle>
        <ul className="drawer-tile flex flex-col rounded-2xl px-2">
          <FreeRow art="training" title="Training" description="A full game, just for practice" onSelect={onTraining} />
          <FreeRow art="story" title="Story" description="Learn and play fun levels" rewards={STORY_REWARDS} ruled onSelect={onStory} />
        </ul>
      </section>

      <section aria-labelledby="play-limited" className="flex flex-col gap-2">
        <SectionTitle id="play-limited">
          <UiIcon name="season" px={28} className="drawer-icon size-7 self-center" />
          Limited
        </SectionTitle>
        {puzzleCard ? (
          <PuzzleMode card={puzzleCard} now={now} onSelect={onPuzzle} />
        ) : (
          <button type="button" disabled className="drawer-tile flex min-h-20 cursor-not-allowed items-center justify-center gap-3 rounded-2xl p-3 opacity-60">
            <UiIcon name="padlock" px={32} className="drawer-icon size-8" />
            <span className="text-outline text-xl font-bold">Coming soon</span>
          </button>
        )}
      </section>
    </>
  );
}

/**
 * The Puzzle's painting: a stand-in until its own is drawn as the other modes' (the deck, the season's calendar over its corner), the
 * cards' painting's width.
 */
export function PuzzleArt({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative block aspect-[3/2] shrink-0", className)}>
      <UiIcon name="deck" px={64} className="drawer-icon absolute top-0 left-[12%] h-full w-auto" />
      <UiIcon name="season" px={36} className="drawer-icon absolute right-[4%] -bottom-0.5 h-[52%] w-auto" />
    </span>
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
 * The Puzzle's card (Limited, the owner's asks of 2026-11-08): the cards' height, its whole face its button. The stand-in painting,
 * "Puzzle" and the player's place of the day beside it (carved, "#28", no total), then the line: "One deck for all" until they play,
 * their best of the day (PB) once they have one, their game's score while one is open (a tap then opens it). Its reward at its end,
 * the Cobbles alone; the day's time left in a carved tab in its bottom-right corner, amber under an hour.
 */
function PuzzleMode({ card, now, onSelect }: { card: PuzzleCard; now: number; onSelect?: () => void }) {
  const left = card.endsAt - now;
  const line = card.playing ? (
    <span className="text-outline flex items-center gap-1 text-base leading-tight font-bold">
      <UiIcon name="star" px={20} className="drawer-icon size-5" />
      <span className="numeric">{formatPoints(card.playing.score)}</span>
      <span className="text-sm font-semibold text-muted-foreground">in play</span>
    </span>
  ) : card.best ? (
    <span className="text-outline flex items-center gap-1 text-base leading-tight font-bold">
      <UiIcon name="star" px={20} className="drawer-icon size-5" />
      <span className="numeric">{formatPoints(card.best.score)}</span>
      <span className="text-sm font-semibold text-muted-foreground">PB</span>
    </span>
  ) : (
    <span className="text-sm font-semibold text-muted-foreground">One deck for all</span>
  );
  return (
    <div data-slot="puzzle-card" className="drawer-tile state-layer relative flex items-center gap-2 rounded-2xl p-2 pr-3">
      <PuzzleArt className={CARD_ART} />
      <button
        type="button"
        onClick={onSelect}
        aria-label={card.playing ? `Puzzle: resume your game, ${formatPoints(card.playing.score)} points` : "Puzzle"}
        className={cn(COVER, "flex-1 gap-0.5")}
      >
        <span className="flex items-center gap-2">
          <span className={TITLE}>Puzzle</span>
          {card.best && <PuzzleRank place={card.best.place} />}
        </span>
        {line}
      </button>
      <Rewards rewards={PUZZLE_REWARDS} className="-mt-4" />
      <span
        role="timer"
        aria-label={`${puzzleTimeLeft(card.endsAt, now)} left today`}
        className={cn(
          "drawer-carved text-outline pointer-events-none absolute right-0 bottom-0 flex h-6 items-center gap-1 rounded-tl-[0.625rem] rounded-br-2xl pr-2.5 pl-1.5 text-[0.8125rem] font-bold",
          left < PUZZLE_LATE_S && "text-warning",
        )}
      >
        <UiIcon name="countdown" px={16} className="size-4" />
        <span className="numeric">{puzzleTimeLeft(card.endsAt, now)}</span>
      </span>
    </div>
  );
}

/** A row of the Free card: its painting, its name and its line, the row its button; its rewards at its end when it pays something. */
function FreeRow({ art, title, description, rewards, ruled, onSelect }: { art: PlayArtName; title: string; description: string; rewards?: readonly Reward[]; ruled?: boolean; onSelect?: () => void }) {
  return (
    <li style={ruled ? RULE : undefined}>
      <button type="button" onClick={onSelect} className="state-layer my-1 flex w-full cursor-pointer items-center gap-2 rounded-xl py-1 pr-1 text-left">
        <ModeArt name={art} px={96} className={CARD_ART} />
        <span className="flex min-w-0 flex-col">
          <span className={TITLE}>{title}</span>
          <span className="text-sm font-semibold text-muted-foreground">{description}</span>
        </span>
        {rewards && <Rewards rewards={rewards} />}
      </button>
    </li>
  );
}
