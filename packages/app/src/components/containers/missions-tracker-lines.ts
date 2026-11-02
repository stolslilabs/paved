import { TUTORIAL_STEPS, tutorialFinished, tutorialStates, type TutorialCounts } from "@paved/game-core";
import { endOfUtcDay, questPeriod, windowEnd, type ScheduledQuest, type ScheduledQuests } from "../../lib/quest-window";
import { TUTORIAL_TEXT, questText } from "./quest-text";

// MISSIONS-TRACKER (#978): which missions the home's tracker shows, and in what order. Read by the tracker's own lazy chunk
// (`routes/missions-count.tsx`) and by the mocks; the scene and the tracker's view take its result as data.

/** A mission of the Missions page, by what it is: a Tutorial step (#977), a quest of the day or the week, or an achievement. */
export type MissionKey = `tutorial:${number}` | `quest:${number}` | `achievement:${number}`;

/** `tutorial:3`, `quest:12`, `achievement:4`: a mission's key as a link names it (`/missions?mission=`). */
export const MISSION_KEY = /^(tutorial|quest|achievement):[1-9]\d{0,5}$/;

/** The key `value` names, or undefined: a link's parameter, read as a key only when it is one. */
export const missionKeyOf = (value: string | null | undefined): MissionKey | undefined => (value && MISSION_KEY.test(value) ? (value as MissionKey) : undefined);

/** At most this many lines (#978: the three closest to done). */
export const TRACKER_LINES = 3;

/** A line of the tracker: a mission, its icon and title, its progress, or Claim for a Tutorial step done and not claimed. */
export interface TrackerLine {
  key: MissionKey;
  kind: "tutorial" | "daily" | "weekly";
  title: string;
  /** A Font Awesome name, the Missions page's icon of the mission. */
  icon: string;
  count: number;
  total: number;
  /** A Tutorial step done and not claimed: Claim in place of the bar. */
  claim: boolean;
}

/**
 * What the tracker shows (#978): its lines; "All done" with the countdown to the day's reset when nothing is left; or a plain
 * line to the page (`none`: a guest, or the quests not read).
 */
export type TrackerState = { kind: "lines"; lines: readonly TrackerLine[] } | { kind: "done"; resetsAt: number } | { kind: "none" };

/** How far a quest is, 0 to 1: its tasks' mean, as the page's tiles. */
const fraction = (q: ScheduledQuest): number => (q.tasks.length === 0 ? 0 : q.tasks.reduce((sum, t) => sum + (t.total > 0 ? Math.min(1, t.count / t.total) : 0), 0) / q.tasks.length);

/**
 * The tracker's lines (#978, the proposal's point 3): first the Tutorial's steps done and not claimed (Claim), in order, then its
 * open step; then the Daily and Weekly quests not yet done, the furthest along first (their tasks' mean), on a tie the one whose
 * window ends first, then by the page's order. No Lifetime achievement (open point 2). At most three; with none left, "All done".
 * The quests a tracker shows are those of `quests` (today's, on the indexer's clock `now`); `tutorial` null: not served, or none.
 */
export function trackerState({ quests, tutorial, now }: { quests: ScheduledQuests; tutorial: { counts: TutorialCounts; claimed: number } | null; now: number }): TrackerState {
  const lines: TrackerLine[] = [];
  if (tutorial && !tutorialFinished(tutorial.claimed)) {
    const states = tutorialStates(tutorial.counts, tutorial.claimed);
    const line = (i: number, claim: boolean): TrackerLine => {
      const step = TUTORIAL_STEPS[i]!;
      const text = TUTORIAL_TEXT[step.task];
      return {
        key: `tutorial:${step.id}`,
        kind: "tutorial",
        title: text.title,
        icon: text.icon,
        count: Math.min(step.target, tutorial.counts[step.task] ?? 0),
        total: step.target,
        claim,
      };
    };
    states.forEach((s, i) => s === "done" && lines.push(line(i, true)));
    const open = states.indexOf("open");
    if (open !== -1) lines.push(line(open, false));
  }
  const endOf = (q: ScheduledQuest): number => windowEnd([q], now) ?? (questPeriod(q) === "daily" ? endOfUtcDay(now) : Infinity);
  const order = (q: ScheduledQuest) => (questPeriod(q) === "daily" ? 0 : 1);
  const left = quests.quests
    .filter((q) => !q.completed && !q.retired)
    .map((q, i) => ({ q, i, f: fraction(q), end: endOf(q) }))
    .sort((a, b) => b.f - a.f || a.end - b.end || order(a.q) - order(b.q) || a.i - b.i);
  for (const { q } of left) {
    const text = questText(q.questId);
    const task = q.tasks[0];
    lines.push({
      key: `quest:${q.questId}`,
      kind: questPeriod(q),
      title: text.title,
      icon: text.icon,
      count: q.tasks.length === 1 && task ? Math.min(task.count, task.total) : q.tasks.filter((t) => t.count >= t.total).length,
      total: q.tasks.length === 1 && task ? task.total : q.tasks.length,
      claim: false,
    });
  }
  if (lines.length === 0) return { kind: "done", resetsAt: endOfUtcDay(now) };
  return { kind: "lines", lines: lines.slice(0, TRACKER_LINES) };
}
