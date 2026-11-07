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
}

/**
 * A mode's painting, its foot on the frame's: decorative, the card's words name it. `px` is its width from `mobile` (360 px); `className`
 * its width (a phone under 360 px draws it smaller, so a card's title and gift keep their room).
 */
function ModeArt({ name, px, className }: { name: PlayArtName; px: number; className: string }) {
  return <img {...playArtSources(name, px)} alt="" draggable={false} decoding="async" className={cn("h-auto shrink-0", className)} />;
}
/** The paintings of the cards and of the Free rows, one size, smaller under 360 px. */
const CARD_ART = "w-18 mobile:w-24";
/** The cards' and rows' titles, a step smaller under 360 px. */
const TITLE = "text-outline text-lg leading-tight font-bold mobile:text-xl";

/** What a mode can win, over its gift: the HUD's own icons. */
type Reward = "paved" | "xp" | "chest" | "crown";
const REWARD_NAMES: Record<Reward, string> = { paved: "PAVED", xp: "XP", chest: "chests", crown: "crowns" };

/** A reward's icon, 28 px: the PAVED coin, the level bar's blue star with "XP" in it (the HUD's `LevelStar`), the dock's chest, the crown. */
function RewardIcon({ reward }: { reward: Reward }) {
  if (reward === "paved") return <TokenIcon kind="paved" size="lg" className="drawer-icon size-7" px={28} />;
  if (reward === "xp")
    return (
      <span className="relative grid size-7 shrink-0 place-items-center">
        <UiIcon name="level-star" px={28} className="absolute inset-0 size-full [filter:drop-shadow(0_1px_0_var(--background))]" />
        <span className="text-outline relative text-xs leading-none font-bold text-foreground tabular-nums">XP</span>
      </span>
    );
  if (reward === "crown") return <UiIcon name="crown" px={28} className="drawer-icon size-7" />;
  return <UiIcon name="chests" px={28} className="drawer-icon size-7" />;
}

/** The rewards fanned over the gift: tilted out from the middle one, which stands higher. */
const FAN: Record<number, readonly CSSProperties[]> = {
  1: [{}],
  2: [{ transform: "translateY(4px) rotate(-10deg)" }, { transform: "translateY(4px) rotate(10deg)" }],
  3: [{ transform: "translateY(7px) rotate(-14deg)" }, {}, { transform: "translateY(7px) rotate(14deg)" }],
};
const GIFT_BOX: CSSProperties = { width: "4.75rem", height: "4.25rem" };

/**
 * A mode's prize (the owner's asks of 2026-11-06, in place of the book's tags: "an open gift box with what it pays above it"): the HUD's
 * gift opened (`gift-open`, the red box with its gold ribbon, its lid lifted, light coming out) under the rewards' icons, fanned, each
 * bobbing in turn (still under reduced motion, `MotionConfig`). Named for a screen reader by its rewards. It takes no tap
 * (`pointer-events-none`): drawn above the card's stretched button, a tap on it reaches that button (#1041).
 */
function RewardGift({ rewards }: { rewards: readonly Reward[] }) {
  const fan = FAN[rewards.length] ?? FAN[3]!;
  return (
    <span role="img" aria-label={`Rewards: ${rewards.map((r) => REWARD_NAMES[r]).join(", ")}`} style={GIFT_BOX} className="pointer-events-none relative ml-auto flex shrink-0 flex-col items-center justify-end">
      <UiIcon name="gift-open" px={44} className="drawer-icon size-11" />
      <span className="absolute inset-x-0 top-0 flex justify-center">
        {rewards.map((reward, i) => (
          <span key={reward} style={fan[i]}>
            <m.span className="block" animate={{ y: [0, -4, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.25, repeatDelay: 0.6 }}>
              <RewardIcon reward={reward} />
            </m.span>
          </span>
        ))}
      </span>
    </span>
  );
}

const CHALLENGE_REWARDS: readonly Reward[] = ["paved", "xp", "chest"];
const ATTACK_REWARDS: readonly Reward[] = ["crown", "xp", "chest"];
const STORY_REWARDS: readonly Reward[] = ["xp", "chest"];

/** The card's whole face is its button (`after:inset-0`); what sits over it (Resume) is lifted above that layer. */
const COVER = "flex min-w-0 cursor-pointer flex-col text-left after:absolute after:inset-0 disabled:cursor-not-allowed";
/** The soft rule between the Free card's rows, the Shop's: the bevel's grey, half see-through. */
const RULE: CSSProperties = { borderTop: "1px solid color-mix(in oklab, var(--drawer-bevel) 45%, transparent)" };
/** Resume on the book's gold pill (edit mode's Use, `gold-pill` in theme.css), its image the HUD frame `save-pill`. */
const SAVE_PILL = { "--save-pill": uiFrameImageSet("save-pill") } as CSSProperties;

/**
 * The Play page's modes (PLAY-PAGE, the Paved UX Book's "modes", then the owner's asks of 2026-11-06), four groups under their painted
 * titles, every card raised alike (the Challenge's gold fill left on the owner's ask). Ranked (the crown) first: Attack, its castle and
 * crossed swords, "Raid a rival village", its gift of crowns, XP and chests. Paid (PAVED's coin): the Challenge, its trophy, "Beat the
 * threshold", its gift of PAVED, XP and chests; with a game still open, its time left, its score and Resume in the gift's place
 * ("modes-resume"). Free (the leaf): one raised card, a soft rule between its rows: Training and its line, Story and its line with its
 * gift of XP and chests. Limited (the season's calendar): a mode to come, off. No Connect (NO-GUEST: every player has an account); a
 * pause turns the Challenge off and says why.
 */
export function PlayModes({ spawnPaused, running = null, now = 0, onChallenge, onResume, onTraining, onStory, onAttack }: PlayModesProps) {
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
            <RewardGift rewards={ATTACK_REWARDS} />
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
          {!running && <RewardGift rewards={CHALLENGE_REWARDS} />}
        </div>
      </section>

      <section aria-labelledby="play-free" className="flex flex-col gap-2">
        <SectionTitle id="play-free">
          <UiIcon name="theme-forest" px={28} className="drawer-icon size-7 self-center" />
          Free
        </SectionTitle>
        <ul className="drawer-tile flex flex-col rounded-2xl px-2">
          <FreeRow art="training" title="Training" description="A full game, just for practice" onSelect={onTraining} />
          <FreeRow art="story" title="Story" description="Learn the rules, level by level" rewards={STORY_REWARDS} ruled onSelect={onStory} />
        </ul>
      </section>

      <section aria-labelledby="play-limited" className="flex flex-col gap-2">
        <SectionTitle id="play-limited">
          <UiIcon name="season" px={28} className="drawer-icon size-7 self-center" />
          Limited
        </SectionTitle>
        <button type="button" disabled className="drawer-tile flex min-h-20 cursor-not-allowed items-center justify-center gap-3 rounded-2xl p-3 opacity-60">
          <UiIcon name="padlock" px={32} className="drawer-icon size-8" />
          <span className="text-outline text-xl font-bold">Coming soon</span>
        </button>
      </section>
    </>
  );
}

/** A row of the Free card: its painting, its name and its line, the row its button; its gift at its end when it pays something. */
function FreeRow({ art, title, description, rewards, ruled, onSelect }: { art: PlayArtName; title: string; description: string; rewards?: readonly Reward[]; ruled?: boolean; onSelect?: () => void }) {
  return (
    <li style={ruled ? RULE : undefined}>
      <button type="button" onClick={onSelect} className="state-layer my-1 flex w-full cursor-pointer items-center gap-2 rounded-xl py-1 pr-1 text-left">
        <ModeArt name={art} px={96} className={CARD_ART} />
        <span className="flex min-w-0 flex-col">
          <span className={TITLE}>{title}</span>
          <span className="text-sm font-semibold text-muted-foreground">{description}</span>
        </span>
        {rewards && <RewardGift rewards={rewards} />}
      </button>
    </li>
  );
}
