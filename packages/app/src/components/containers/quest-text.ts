// What the screens say about quests and achievements, from app-web's `utils/quests-view.ts` (the accepted list,
// docs/architecture/quests.md, P-22). Titles, descriptions and icons are not on chain: they are keyed by id. Targets are
// not written here: the screens show the totals the indexer serves. An id the list does not know shows its number.

export const QUEST_TEXT: Record<number, { title: string; description: string; icon: string }> = {
  1: { title: "Daily Run", description: "Finish today's Challenge.", icon: "flag-checkered" },
  2: { title: "Master Builder", description: "Score roads and cities in a day.", icon: "city" },
  3: { title: "Into the Woods", description: "Close a forest: it scores its closed roads and cities.", icon: "tree" },
  4: { title: "Point Chaser", description: "Collect points in a day: the sum of the day's finished Challenge games, not a single game.", icon: "star" },
  // v2a (quests-v2.md 2.1): the rotating dailies and the weeklies. Provisional until CORE v2a and P9 fix the ids.
  5: { title: "Master Builder II", description: "Score twice as many roads and cities in a day.", icon: "city" },
  6: { title: "Forest Warden", description: "Close three forests in a day.", icon: "tree" },
  7: { title: "Point Chaser II", description: "Collect twice the points in a day, over the day's finished games.", icon: "star" },
  8: { title: "Weekly Forester", description: "Close forests over the week.", icon: "tree" },
  9: { title: "Weekly Builder", description: "Score roads and cities over the week.", icon: "city" },
  10: { title: "Weekly Points", description: "Collect points over the week's finished games.", icon: "trophy" },
};

export const ACHIEVEMENT_TEXT: Record<number, { title: string; description: string; icon: string }> = {
  1: { title: "First Stone", description: "Finish the tutorial and claim it.", icon: "graduation-cap" },
  2: { title: "Settler I", description: "Finish a Challenge game.", icon: "house-chimney" },
  3: { title: "Settler II", description: "Finish Challenge games: the second tier.", icon: "house-chimney" },
  4: { title: "Settler III", description: "Finish Challenge games: the third tier.", icon: "house-chimney" },
  5: { title: "Grand Builder", description: "Score a large road or city.", icon: "chess-rook" },
  6: { title: "Forester", description: "Score forests.", icon: "tree" },
  7: { title: "Pilgrimage", description: "Score a wonder.", icon: "landmark-dome" },
  8: { title: "High Roller", description: "Finish a Challenge game with a high score.", icon: "dice" },
  9: { title: "On the Podium", description: "Take a place in the top 3 of a day. Counted once the day has closed.", icon: "crown" },
};

/** What one unit of a task is, after its count ("2,710 / 3,000 points"), by task id. */
export const TASK_UNIT: Record<number, string> = {
  1: "Challenge games finished",
  2: "roads and cities scored",
  3: "points",
  4: "forests scored",
  5: "wonders scored",
  6: "large structures scored",
  7: "high-score games",
  8: "podium places",
  9: "wins",
  10: "tutorial claimed",
};

export const questText = (id: number) => QUEST_TEXT[id] ?? { title: `Quest #${id}`, description: "", icon: "scroll" };
export const achievementText = (id: number) => ACHIEVEMENT_TEXT[id] ?? { title: `Achievement #${id}`, description: "", icon: "medal" };
export const taskUnit = (taskId: number) => TASK_UNIT[taskId] ?? `task ${taskId}`;
