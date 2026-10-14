// What the screens say about quests and achievements. Titles and descriptions are not on chain: they are keyed by id,
// from the accepted list (docs/architecture/quests.md, P-22) and its v2a section (quests 5 to 16, achievements 10 to 16). Targets are NOT written here (they are first guesses, to be
// calibrated): the screens show the numbers the indexer serves, from the chain's definitions. An id the list does not know
// is shown by its number, with no description. No reward is shown anywhere: v1 has none.
import type { AchievementDefinition, QuestDefinition, TaskTarget } from "@paved/chain";

export const QUEST_TEXT: Record<number, { title: string; description: string }> = {
  1: { title: "Daily Run", description: "Finish today's Challenge." },
  2: { title: "Master Builder", description: "Score roads and cities in a day." },
  3: { title: "Into the Woods", description: "Close a forest: it scores its closed roads and cities." },
  4: { title: "Point Chaser", description: "Collect points in a day: the sum of the scores of the day's finished Challenge games, not a single game." },
  // v2a rotating dailies: one of each family is live a day, the target changing with the day (every third UTC day each).
  5: { title: "Small Works", description: "Score roads and cities in a day: the small target of the three that rotate." },
  6: { title: "Public Works", description: "Score roads and cities in a day: the middle target of the three that rotate." },
  7: { title: "Great Works", description: "Score roads and cities in a day: the large target of the three that rotate." },
  8: { title: "Woodland Walk", description: "Score forests in a day: the small target of the three that rotate." },
  9: { title: "Deep Woods", description: "Score forests in a day: the middle target of the three that rotate." },
  10: { title: "Old Growth", description: "Score forests in a day: the large target of the three that rotate." },
  11: { title: "Warm-Up Score", description: "Collect points in a day: the small target of the three that rotate." },
  12: { title: "Strong Day", description: "Collect points in a day: the middle target of the three that rotate." },
  13: { title: "Grand Day", description: "Collect points in a day: the large target of the three that rotate." },
  // v2a weeklies: the games finished from Monday to Sunday UTC.
  14: { title: "Weekly Forester", description: "Score forests over the week, Monday to Sunday UTC." },
  15: { title: "Weekly Builder", description: "Score roads and cities over the week, Monday to Sunday UTC." },
  16: { title: "Weekly Points", description: "Collect points over the week's finished Challenge games, Monday to Sunday UTC." },
};

export const ACHIEVEMENT_TEXT: Record<number, { title: string; description: string }> = {
  1: { title: "First Stone", description: "Finish the tutorial and claim it." },
  2: { title: "Settler I", description: "Finish a Challenge game." },
  3: { title: "Settler II", description: "Finish Challenge games: the second tier." },
  4: { title: "Settler III", description: "Finish Challenge games: the third tier." },
  5: { title: "Grand Builder", description: "Score a large road or city." },
  6: { title: "Forester", description: "Score forests." },
  7: { title: "Pilgrimage", description: "Score a wonder." },
  8: { title: "High Roller", description: "Finish a Challenge game with a high score." },
  9: { title: "On the Podium", description: "Take a place in the top 3 of a day's tournament. Counted once the day has closed." },
  // v2a higher tiers.
  10: { title: "Forester II", description: "Score more forests: the second tier of Forester." },
  11: { title: "Pilgrimage II", description: "Score more wonders: the second tier of Pilgrimage." },
  12: { title: "Grand Builder II", description: "Score more large roads and cities: the second tier of Grand Builder." },
  13: { title: "High Roller II", description: "Finish more Challenge games with a high score: the second tier of High Roller." },
  14: { title: "High Roller III", description: "Finish still more Challenge games with a high score: the third tier of High Roller." },
  15: { title: "Settler IV", description: "Finish Challenge games: the fourth tier." },
  16: { title: "Settler V", description: "Finish Challenge games: the fifth tier." },
};

/** What one unit of a task is, after the count ("2,700 / 3,000 points"). */
const TASK_UNIT: Record<number, string> = {
  1: "Challenge games finished",
  2: "roads and cities scored",
  3: "points",
  4: "forests scored",
  5: "wonders scored",
  6: "large structures scored",
  7: "high-score games",
  8: "podium places",
  9: "wins",
  // TUTORIAL_FINISHED: credited by the player's claim, `Setup.claim_tutorial()`, unchecked on chain (D-21, P-49).
  10: "tutorial claimed",
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

/** When a quest counts, from its schedule; nothing is guessed for a schedule that is none of those the list uses. */
export function scheduleLabel(q: Pick<QuestDefinition, "startTime" | "endTime" | "duration" | "interval">): string {
  if (q.duration === 86400 && q.interval === 86400) return "Every UTC day";
  if (q.duration === 86400 && q.interval === 259200) return "Every third UTC day";
  // The week is Monday to Sunday only when it starts on a Monday: start 345,600 (1970-01-05) plus whole weeks.
  if (q.duration === 604800 && q.interval === 604800 && (((q.startTime - 345600) % 604800) + 604800) % 604800 === 0) return "Every week (Monday to Sunday UTC)";
  if (q.duration === 0 && q.interval === 0) return "Once";
  return "On a custom schedule";
}

/** "Points" of an achievement, shown for display only. */
export const pointsLabel = (points: number): string => `${count(points)} ${points === 1 ? "point" : "points"}`;

export type DefinitionLike = QuestDefinition | AchievementDefinition;
