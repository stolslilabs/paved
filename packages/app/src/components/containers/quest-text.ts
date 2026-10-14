// What the screens say about quests and achievements, from app-web's `utils/quests-view.ts` (the accepted list,
// docs/architecture/quests.md, P-22, and its v2a section). The titles and texts of quests 5 to 16 and achievements 10 to 16 are
// copied from there (app-web is not a dependency of this package), with an icon each: keep the two in step.
// Titles, descriptions and icons are not on chain: they are keyed by id. Targets are
// not written here: the screens show the totals the indexer serves. An id the list does not know shows its number.

export const QUEST_TEXT: Record<number, { title: string; description: string; icon: string }> = {
  1: { title: "Daily Run", description: "Finish today's Challenge.", icon: "flag-checkered" },
  2: { title: "Master Builder", description: "Score roads and cities in a day.", icon: "city" },
  3: { title: "Into the Woods", description: "Close a forest: it scores its closed roads and cities.", icon: "tree" },
  4: { title: "Point Chaser", description: "Collect points in a day: the sum of the day's finished Challenge games, not a single game.", icon: "star" },
  // v2a (quests.md "As built: v2a", CORE's proposals): the rotating dailies, three sets of three, and the weeklies.
  5: { title: "Small Works", description: "Score roads and cities in a day: the small target of the three that rotate.", icon: "city" },
  6: { title: "Public Works", description: "Score roads and cities in a day: the middle target of the three that rotate.", icon: "city" },
  7: { title: "Great Works", description: "Score roads and cities in a day: the large target of the three that rotate.", icon: "city" },
  8: { title: "Woodland Walk", description: "Score forests in a day: the small target of the three that rotate.", icon: "tree" },
  9: { title: "Deep Woods", description: "Score forests in a day: the middle target of the three that rotate.", icon: "tree" },
  10: { title: "Old Growth", description: "Score forests in a day: the large target of the three that rotate.", icon: "tree" },
  11: { title: "Warm-Up Score", description: "Collect points in a day: the small target of the three that rotate.", icon: "star" },
  12: { title: "Strong Day", description: "Collect points in a day: the middle target of the three that rotate.", icon: "star" },
  13: { title: "Grand Day", description: "Collect points in a day: the large target of the three that rotate.", icon: "star" },
  14: { title: "Weekly Forester", description: "Score forests over the week, Monday to Sunday UTC.", icon: "tree" },
  15: { title: "Weekly Builder", description: "Score roads and cities over the week, Monday to Sunday UTC.", icon: "city" },
  16: { title: "Weekly Points", description: "Collect points over the week's finished Challenge games, Monday to Sunday UTC.", icon: "trophy" },
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
  // v2a higher tiers.
  10: { title: "Forester II", description: "Score more forests: the second tier of Forester.", icon: "tree" },
  11: { title: "Pilgrimage II", description: "Score more wonders: the second tier of Pilgrimage.", icon: "landmark-dome" },
  12: { title: "Grand Builder II", description: "Score more large roads and cities: the second tier of Grand Builder.", icon: "chess-rook" },
  13: { title: "High Roller II", description: "Finish more Challenge games with a high score: the second tier of High Roller.", icon: "dice" },
  14: { title: "High Roller III", description: "Finish still more Challenge games with a high score: the third tier of High Roller.", icon: "dice" },
  15: { title: "Settler IV", description: "Finish Challenge games: the fourth tier.", icon: "house-chimney" },
  16: { title: "Settler V", description: "Finish Challenge games: the fifth tier.", icon: "house-chimney" },
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
