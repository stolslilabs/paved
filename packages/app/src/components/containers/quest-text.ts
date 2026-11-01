import type { TutorialTask } from "@paved/game-core";

// What the screens say about quests and achievements, from the legacy client's `utils/quests-view.ts` (the accepted list,
// docs/architecture/quests.md, P-22, and its v2a section). The titles and texts of quests 1 and 5 to 16 and achievements 1 to 16
// are copied from there (app-web, removed in P-70; see git history), with an icon each. Quests 2 to 4
// are not here: v1's, never defined at the fresh deployment, which is the only one this app knows.
// Titles, descriptions and icons are not on chain: they are keyed by id. Targets are
// not written here: the screens show the totals the indexer serves. An id the list does not know shows its number.

/**
 * The longest description, in characters (#975): the Missions card keeps two lines of it. Measured at 320 px on 2026-11-01
 * (Rubik, 12 px, a 254 px line in the card): the first text of these words to need a third line had 79 characters; 72 keeps
 * a margin. A longer description is rewritten shorter, not cut.
 */
export const DESCRIPTION_MAX = 72;

export const QUEST_TEXT: Record<number, { title: string; description: string; icon: string }> = {
  1: { title: "Daily Run", description: "Finish today's Challenge.", icon: "flag-checkered" },
  // The rotating dailies (quests.md "As built: v2a", and #869's fourth set, 17 to 19 below), four sets of three: one of each
  // family is live a day, beside Daily Run.
  5: { title: "Small Works", description: "Score roads and cities in a day: the smallest of three rotating targets.", icon: "castle" },
  6: { title: "Public Works", description: "Score roads and cities in a day: the middle of three rotating targets.", icon: "castle" },
  7: { title: "Great Works", description: "Score roads and cities in a day: the largest of three rotating targets.", icon: "castle" },
  8: { title: "Woodland Walk", description: "Score forests in a day: the smallest of three rotating targets.", icon: "tree" },
  9: { title: "Deep Woods", description: "Score forests in a day: the middle of three rotating targets.", icon: "tree" },
  10: { title: "Old Growth", description: "Score forests in a day: the largest of three rotating targets.", icon: "tree" },
  11: { title: "Warm-Up Score", description: "Collect points in a day: the smallest of three rotating targets.", icon: "star" },
  12: { title: "Strong Day", description: "Collect points in a day: the middle of three rotating targets.", icon: "star" },
  13: { title: "Grand Day", description: "Collect points in a day: the largest of three rotating targets.", icon: "star" },
  // The weeklies: the games finished from Monday to Sunday UTC.
  14: { title: "Weekly Forester", description: "Score forests over the week, Monday to Sunday UTC.", icon: "tree" },
  15: { title: "Weekly Builder", description: "Score roads and cities over the week, Monday to Sunday UTC.", icon: "castle" },
  16: { title: "Weekly Points", description: "Collect points in finished Challenge games, Monday to Sunday UTC.", icon: "trophy" },
  // The fourth rotating family (#869, the fifth daily of the day).
  17: { title: "Second Round", description: "Finish Challenge games in a day: the smallest of three rotating targets.", icon: "flag-checkered" },
  18: { title: "Busy Day", description: "Finish Challenge games in a day: the middle of three rotating targets.", icon: "flag-checkered" },
  19: { title: "Long Haul", description: "Finish Challenge games in a day: the largest of three rotating targets.", icon: "flag-checkered" },
  // The PvP weeklies (#976): the attacks settled from Monday to Sunday UTC, and their stars.
  20: { title: "Weekly Raider", description: "Settle PvP attacks over the week, Monday to Sunday UTC.", icon: "swords" },
  21: { title: "Weekly Stars", description: "Earn stars in PvP attacks over the week, Monday to Sunday UTC.", icon: "star" },
};

export const ACHIEVEMENT_TEXT: Record<number, { title: string; description: string; icon: string }> = {
  1: { title: "First Stone", description: "Finish the first Story level and claim it.", icon: "graduation-cap" },
  2: { title: "Settler I", description: "Finish a Challenge game.", icon: "house-chimney" },
  3: { title: "Settler II", description: "Finish Challenge games: the second tier.", icon: "house-chimney" },
  4: { title: "Settler III", description: "Finish Challenge games: the third tier.", icon: "house-chimney" },
  5: { title: "Grand Builder", description: "Score a large road or city.", icon: "chess-rook" },
  6: { title: "Forester", description: "Score forests.", icon: "tree" },
  7: { title: "Pilgrimage", description: "Score a wonder.", icon: "landmark-dome" },
  8: { title: "High Roller", description: "Finish a Challenge game with a high score.", icon: "dice" },
  9: { title: "On the Podium", description: "Take a top 3 place in a day's tournament, counted once the day closes.", icon: "crown" },
  // v2a higher tiers.
  10: { title: "Forester II", description: "Score more forests: the second tier of Forester.", icon: "tree" },
  11: { title: "Pilgrimage II", description: "Score more wonders: the second tier of Pilgrimage.", icon: "landmark-dome" },
  12: { title: "Grand Builder II", description: "Score more large roads and cities: the second tier of Grand Builder.", icon: "chess-rook" },
  13: { title: "High Roller II", description: "Finish more high-score Challenge games: High Roller's second tier.", icon: "dice" },
  14: { title: "High Roller III", description: "Finish still more high-score Challenge games: High Roller's third tier.", icon: "dice" },
  15: { title: "Settler IV", description: "Finish Challenge games: the fourth tier.", icon: "house-chimney" },
  16: { title: "Settler V", description: "Finish Challenge games: the fifth tier.", icon: "house-chimney" },
  // The lifetime league missions (#917, task 23): each league reached once, in place of the first-time bonus of a season.
  17: { title: "Iron League", description: "Reach the Iron league in PvP.", icon: "trophy" },
  18: { title: "Bronze League", description: "Reach the Bronze league in PvP.", icon: "trophy" },
  19: { title: "Silver League", description: "Reach the Silver league in PvP.", icon: "trophy" },
  20: { title: "Gold League", description: "Reach the Gold league in PvP.", icon: "trophy" },
  21: { title: "Emerald League", description: "Reach the Emerald league in PvP.", icon: "trophy" },
  22: { title: "Diamond League", description: "Reach the Diamond league in PvP.", icon: "trophy" },
  23: { title: "Master League", description: "Reach the Master league in PvP.", icon: "trophy" },
  24: { title: "Grand Master", description: "Reach the Grand Master league in PvP.", icon: "trophy" },
};

/**
 * Where a Tutorial step's Go leads (#977, the issue's table): the home in Edit, Play, the PvP, the chests, the tile shop, or the
 * Daily row of the Missions page itself. Rising (the level) has none: its card says how XP comes.
 */
export type TutorialGo = "village-edit" | "play" | "pvp" | "chests" | "tile-shop" | "daily";

/**
 * The Tutorial's steps as the Missions page shows them (#977), by `TUTORIAL_STEPS`' task: the title, what to do, the icon, what
 * its bar counts, and where its Go leads (null: none). The rules (order, targets, Cobbles) are game-core's.
 */
export const TUTORIAL_TEXT: Record<TutorialTask, { title: string; description: string; icon: string; unit: string; go: TutorialGo | null }> = {
  "layout-saved": { title: "Builder", description: "Place a tile in your village and save its layout.", icon: "hammer", unit: "layouts saved", go: "village-edit" },
  "challenge-finished": { title: "Challenger", description: "Finish a Challenge game.", icon: "flag-checkered", unit: "Challenge games finished", go: "play" },
  "attack-settled": { title: "Raider", description: "Settle an attack in PvP: win, lose or surrender.", icon: "swords", unit: "attacks settled", go: "pvp" },
  "attack-won": { title: "Victor", description: "Win an attack in PvP: one star or more.", icon: "star", unit: "attacks won", go: "pvp" },
  "chest-opened": { title: "Treasure", description: "Open a chest.", icon: "treasure-chest", unit: "chests opened", go: "chests" },
  "shop-bought": { title: "Trader", description: "Buy a plan in the tile shop.", icon: "store", unit: "plans bought", go: "tile-shop" },
  "milestone-claimed": { title: "Regular", description: "Claim a gift of the day's bar, above the Daily row.", icon: "gift", unit: "gifts claimed", go: "daily" },
  level: { title: "Rising", description: "Reach level 3.", icon: "arrow-trend-up", unit: "level", go: null },
};

/** How XP comes, on Rising's card (the level step, which has no Go): Story levels and PvP attacks pay it. */
export const TUTORIAL_XP = "XP comes from Story levels and attacks.";

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
  19: "attacks settled",
  20: "stars earned",
  23: "leagues reached",
};

export const questText = (id: number) => QUEST_TEXT[id] ?? { title: `Mission #${id}`, description: "", icon: "scroll" };
export const achievementText = (id: number) => ACHIEVEMENT_TEXT[id] ?? { title: `Mission #${id}`, description: "", icon: "medal" };
export const taskUnit = (taskId: number) => TASK_UNIT[taskId] ?? `task ${taskId}`;
