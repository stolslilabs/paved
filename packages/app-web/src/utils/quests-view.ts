// What the screens say about quests and achievements. Titles and descriptions are not on chain: they are keyed by id,
// from the accepted list (docs/architecture/quests.md, P-22). Targets are NOT written here (they are first guesses, to be
// calibrated): the screens show the numbers the indexer serves, from the chain's definitions. An id the list does not know
// is shown by its number, with no description. No reward is shown anywhere: v1 has none.
import type { AchievementDefinition, QuestDefinition, TaskTarget } from "@paved/chain";

export const QUEST_TEXT: Record<number, { title: string; description: string }> = {
  1: { title: "Daily Run", description: "Finish today's Daily." },
  2: { title: "Master Builder", description: "Score roads and cities in a day." },
  3: { title: "Into the Woods", description: "Score a forest with your Woodsman or Herdsman." },
  4: { title: "Point Chaser", description: "Collect points in a day: the sum of the scores of the day's finished Daily games, not a single game." },
};

export const ACHIEVEMENT_TEXT: Record<number, { title: string; description: string }> = {
  1: { title: "First Stone", description: "Finish the Tutorial." },
  2: { title: "Settler I", description: "Finish a Daily game." },
  3: { title: "Settler II", description: "Finish Daily games: the second tier." },
  4: { title: "Settler III", description: "Finish Daily games: the third tier." },
  5: { title: "Grand Builder", description: "Score a large road or city." },
  6: { title: "Forester", description: "Score forests." },
  7: { title: "Pilgrimage", description: "Score a wonder." },
  8: { title: "High Roller", description: "Finish a Daily game with a high score." },
  9: { title: "On the Podium", description: "Take a place in the top 3 of a day's tournament. Counted once the day has closed." },
};

/** What one unit of a task is, after the count ("2,700 / 3,000 points"). */
const TASK_UNIT: Record<number, string> = {
  1: "Daily games finished",
  2: "roads and cities scored",
  3: "points",
  4: "forests scored",
  5: "wonders scored",
  6: "large structures scored",
  7: "high-score games",
  8: "podium places",
  9: "wins",
  10: "Tutorial games finished",
};

export const questTitle = (id: number): string => QUEST_TEXT[id]?.title ?? `Quest #${id}`;
export const achievementTitle = (id: number): string => ACHIEVEMENT_TEXT[id]?.title ?? `Achievement #${id}`;

const count = (n: number) => n.toLocaleString("en-US");

/** "2,700 / 3,000 points"; a task the list does not know is "task 12". */
export function taskProgressLabel(task: { taskId: number; total: number; count?: number }): string {
  const unit = TASK_UNIT[task.taskId] ?? `task ${task.taskId}`;
  return task.count === undefined ? `${count(task.total)} ${unit}` : `${count(task.count)} / ${count(task.total)} ${unit}`;
}

export function targetsLabel(tasks: TaskTarget[]): string {
  return tasks.map((t) => taskProgressLabel(t)).join(", ");
}

/** When a quest counts, from its schedule; nothing is guessed for a schedule that is none of the two the list uses. */
export function scheduleLabel(q: Pick<QuestDefinition, "startTime" | "endTime" | "duration" | "interval">): string {
  if (q.duration === 86400 && q.interval === 86400) return "Every UTC day";
  if (q.duration === 0 && q.interval === 0) return "Once";
  return "On a custom schedule";
}

/** "Points" of an achievement, shown for display only. */
export const pointsLabel = (points: number): string => `${count(points)} ${points === 1 ? "point" : "points"}`;

export type DefinitionLike = QuestDefinition | AchievementDefinition;
