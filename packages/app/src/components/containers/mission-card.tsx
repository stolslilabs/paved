import { formatNumber } from "@paved/game-core";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { haptic } from "../../lib/haptics";
import { cn } from "../../lib/utils";
import { CheckBadge } from "../elements/check-badge";
import { CobblesBurst } from "../elements/cobbles-burst";
import { GiftArt, type GiftArtState } from "../elements/gift-art";
import { UiIcon } from "../elements/ui-icon";
import { useSfx } from "./audio-provider";
import { GIFT_REVEAL_S, GiftTip } from "./milestones-bar";
import { MissionMedallion, missionArt, type MissionTileState } from "./mission-tile";
import { missionTask } from "./quest-text";

/** A mission's Cobbles (gems-v1.md 3.1) and whether they were claimed. */
export interface ProgressReward {
  cobbles: number;
  claimed: boolean;
  /** The claim is on its way. */
  claiming?: boolean;
  /** Another claim is on its way: this one waits. */
  disabled?: boolean;
}

/** Which list a mission is of (#832): the Tutorial's steps (#977), the day's, the week's, or the achievements (the lifetime ones). */
export type MissionKind = "tutorial" | "daily" | "weekly" | "lifetime";

/** A Tutorial step's own part (#977): its number. */
export interface TutorialPart {
  step: number;
}

/** A mission as the Missions page shows it, a quest or an achievement, from the scene's reads. */
export interface Mission {
  key: string;
  kind: MissionKind;
  title: string;
  /** The text the mission is described by; the card shows its task, its first clause (`missionTask`). */
  description: string;
  icon: string;
  state: MissionTileState;
  /** Each task's count against its total; the card sums them in its counter. */
  progress: readonly { unit: string; count: number; total: number }[];
  reward?: ProgressReward;
  /** A Tutorial step's part (`kind` "tutorial"). */
  tutorial?: TutorialPart;
}

const KIND_LABEL: Record<MissionKind, string> = { tutorial: "Tutorial", daily: "Daily", weekly: "Weekly", lifetime: "Achievement" };

export interface MissionCardProps {
  mission: Mission;
  /** False: the player cannot sign yet (P6): the claim's gift stays still (the page's notice asks to connect). */
  canClaim?: boolean;
  onClaim?: () => void;
  className?: string;
}

/** How far a mission is, 0 to 1: its tasks' mean (the medallion's arc). */
export const missionFraction = (progress: Mission["progress"]): number =>
  progress.length === 0 ? 0 : progress.reduce((sum, p) => sum + (p.total > 0 ? Math.min(1, p.count / p.total) : 0), 0) / progress.length;

/**
 * The gift's state on the card: silvered out of reach (not done), waiting and shaking now and then while its claim is open, shaking
 * fast while it is on its way, lit and still when it cannot be claimed now (no signer, another claim on its way), opening as the claim
 * lands, then open.
 */
function giftState(done: boolean, reward: ProgressReward, open: boolean, opening: boolean): GiftArtState {
  if (reward.claimed) return opening ? "opening" : "open";
  if (!done) return "locked";
  if (reward.claiming) return "shaking";
  return open ? "ready" : "lit";
}

/** The claim's badge on the medallion, its 44 px target centred on the badge's centre (86% across and down the medallion). */
const TARGET: CSSProperties = { left: "calc(86% - 22px)", top: "calc(86% - 22px)", width: 44, height: 44 };

/**
 * The card's claim (MISSIONS-PAGE, the owner's asks of 2026-11-04): the badge at the foot of the card's medallion, a button whose
 * tooltip shows what it holds ("+20" and the Cobble, `GiftTip`, the milestones' gifts' own). Not done, the book's gift silvered, so
 * its reward can be read; done, the gift lit in its gold halo, shaking now and then: a tap claims it; on its way it shakes fast; as
 * the claim lands it opens, then the check; locked, the lock. It keeps the focus while no claim is open (`aria-disabled`), so its
 * tooltip still opens.
 */
function ClaimBadge({ title, state, reward, open, opening, px, onClaim, giftRef }: {
  title: string;
  state: MissionTileState;
  reward: ProgressReward;
  open: boolean;
  opening: boolean;
  px: number;
  onClaim?: () => void;
  giftRef: { current: HTMLElement | null };
}) {
  const done = state === "claimable" || state === "done";
  const { cobbles, claimed } = reward;
  const art = giftState(done, reward, open, opening);
  const label = claimed ? `Claimed: ${title}` : done ? `Claim ${cobbles} Cobbles: ${title}` : `${cobbles} Cobbles once done: ${title}`;
  const sentence = claimed ? `+${cobbles} Cobbles, claimed.` : done ? `+${cobbles} Cobbles, ready to claim.` : `+${cobbles} Cobbles, once done.`;
  const badge = Math.round(px * 0.36);
  return (
    <GiftTip cobbles={cobbles} sentence={sentence} claims={open} busy={!!reward.claiming || opening} tag="card" standing={art} onClaim={() => onClaim?.()}>
      {(trigger) => (
        <button
          {...trigger}
          ref={(el) => {
            trigger.ref(el);
            giftRef.current = el;
          }}
          type="button"
          data-slot="mission-gift"
          data-state={art}
          aria-label={label}
          aria-disabled={!open || undefined}
          aria-busy={reward.claiming || undefined}
          className="absolute grid cursor-pointer place-items-center rounded-full outline-none aria-disabled:cursor-default"
          style={TARGET}
        >
          {claimed && !opening ? (
            <CheckBadge px={badge} style={{ width: badge, height: badge }} />
          ) : state === "locked" ? (
            <UiIcon name="lock" px={badge} className="drawer-icon block" />
          ) : (
            <GiftArt state={art} style={{ fontSize: Math.round(px * 0.4) }} />
          )}
        </button>
      )}
    </GiftTip>
  );
}

/**
 * The selected mission, at the top of the Missions page (#832), after the Paved UX Book's (MISSIONS-PAGE) and the owner's asks of
 * 2026-11-04 (no more text than that, and room for it on a small phone): its medallion (its ring the mission's progress), its kind in
 * a carved chip, its title, its task (the description's first clause, `missionTask`) and a counter, the count in gold ("4 / 8"), each
 * on one line, so the card keeps one height whatever the mission (#975), the text the card's whole width beside the medallion. A
 * mission with Cobbles of its own is claimed from the badge at its medallion's foot (`ClaimBadge`), as the milestones' gifts are: as
 * the claim lands its gift opens, its Cobbles bursting into the balance's plate in the page's header (`CobblesBurst`, the chest's
 * sound and a buzz). One with none (a daily, a weekly, paid at their row's gifts) keeps the medallion's own badge.
 */
export function MissionCard({ mission, canClaim = true, onClaim, className }: MissionCardProps) {
  const { key, kind, title, description, icon, state, progress, reward } = mission;
  const done = state === "claimable" || state === "done";
  const task = missionTask(description);
  const total = progress.reduce((sum, p) => sum + p.total, 0);
  const count = progress.reduce((sum, p) => sum + Math.min(p.count, p.total), 0);
  const open = done && reward !== undefined && !reward.claimed && !reward.claiming && canClaim && !reward.disabled;
  const play = useSfx();
  const gift = useRef<HTMLElement | null>(null);
  // A claim seen landing on the shown mission (its Cobbles claimed while it is on the card) opens its gift and bursts once; another
  // mission, or one read already claimed, does not.
  const claimed = reward?.claimed ?? false;
  const [seen, setSeen] = useState({ key, claimed });
  const [opening, setOpening] = useState(false);
  const [burst, setBurst] = useState(0);
  if (seen.key !== key || seen.claimed !== claimed) {
    const landed = seen.key === key && !seen.claimed && claimed;
    setSeen({ key, claimed });
    setOpening(landed);
    if (landed) setBurst((n) => n + 1);
  }
  useEffect(() => {
    if (!opening) return;
    const timer = setTimeout(() => setOpening(false), GIFT_REVEAL_S * 1000);
    return () => clearTimeout(timer);
  }, [opening]);
  // The burst played, once its stones have flown.
  const [burstDone, setBurstDone] = useState(0);
  useEffect(() => {
    if (burst === 0) return;
    play("burst");
    haptic("firm");
  }, [burst, play]);
  const PX = 88;
  return (
    <article data-slot="card" data-state={state} aria-label={title} className={cn("flex items-center gap-3", className)}>
      <MissionMedallion art={missionArt(icon)} state={state} progress={missionFraction(progress)} px={PX} badges={!reward} className="w-22 shrink-0">
        {reward && <ClaimBadge title={title} state={state} reward={reward} open={open} opening={opening} px={PX} onClaim={onClaim} giftRef={gift} />}
      </MissionMedallion>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="drawer-carved shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold">{KIND_LABEL[kind]}</span>
        <h2 title={title} className="text-outline max-w-full truncate text-xl leading-tight font-bold">
          {title}
        </h2>
        <p title={task || undefined} aria-hidden={task ? undefined : true} data-slot="mission-task" className="min-h-lh max-w-full truncate text-xs font-semibold text-muted-foreground">
          {task}
        </p>
        {/* The counter is the tasks' bar (the medallion's ring draws it): a progress bar for assistive technology, named by its tasks. */}
        <p
          role="progressbar"
          aria-label={`${progress.map((p) => p.unit).join(", ")}: ${formatNumber(count)} of ${formatNumber(total)}`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={count}
          data-slot="mission-count"
          className="text-outline min-h-lh text-xl leading-tight font-bold tabular-nums"
        >
          <span className={done ? "text-success" : "text-primary"}>{formatNumber(count)}</span> / {formatNumber(total)}
        </p>
      </div>
      {burst !== burstDone && <CobblesBurst key={burst} from={() => gift.current} onDone={() => setBurstDone(burst)} />}
    </article>
  );
}
