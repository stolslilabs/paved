// The rules of PvP v2 (#732, #741), pure: the free village and its score, slots and XP, the starter layouts, the attack's deck,
// queue and stars, chests, the daily shop and the quests' bonus, the Tutorial's steps (#977), the editor's random compact layout (#803),
// the saved layouts' slots (#804). The contracts (#733 to #738) match them through parity tests.
// The layout search (`grow.ts`) is an offline tool and stays out.

export { BASE_DECK_CARDS, BASE_PLAN_CODES, COMMON_COPIES, UNCOMMON_COPIES, baseCopies, basePlanOf, basePlanOfCard, isPlanCode, rarityOf } from "./rarity";
export type { Rarity } from "./rarity";
export {
  CHALLENGE_XP,
  DEFENCE_XP,
  LEVEL_CAP,
  PVP_XP,
  SLOT_BASE,
  STORY_XP_PER_STAR,
  XP_CAP,
  XP_STEP,
  addXp,
  levelStatus,
  pvpXp,
  slotsOf,
  storyXp,
  xpFloor,
  xpLevelOf,
} from "./xp";
export type { LevelStatus } from "./xp";
export {
  STARTER_TILE,
  VillageDraft,
  buildOrder,
  emptyInventory,
  freeInventory,
  inventoryOf,
  inventorySize,
  layoutGame,
  layoutRefusal,
  layoutScore,
  sameLayout,
  starterBoard,
} from "./free-village";
export type { DraftRefusal, Inventory, LayoutLimits, LayoutRefusal, LayoutTile } from "./free-village";
export { RANDOM_LAYOUT_MS, RANDOM_LAYOUT_STEPS, RANDOM_LAYOUT_TRIES, randomLayout } from "./random-layout";
export type { RandomLayout, RandomLayoutBudget } from "./random-layout";
export {
  LAYOUT_SLOTS,
  LAYOUT_SLOT_PRICES,
  activateSlotRefusal,
  buySlotRefusal,
  isLayoutSlot,
  layoutSlotOpen,
  layoutSlotPrice,
  layoutSlotsOf,
  saveSlotRefusal,
  withSlotActive,
  withSlotBought,
  withSlotSaved,
} from "./layout-slots";
export type { LayoutSlotRefusal, LayoutSlots } from "./layout-slots";
export { SCORED_CATEGORIES, breakdownOf, byCategory, layoutBreakdown } from "./breakdown";
export type { CategorySum, CellAreas, LayoutBreakdown, LayoutLine } from "./breakdown";
export { STARTER_LAYOUTS, STARTER_TILES, starterIndex, starterLayout } from "./starters";
export {
  ATTACK_DECK_PERCENT,
  ATTACK_STAR_PERCENTS,
  ATTACK_VIEW,
  QueuedAttack,
  attackDeck,
  attackDeckSize,
  attackExtras,
  attackStarPoints,
  attackStars,
} from "./attack";
export type { QueuedMove } from "./attack";
export {
  CHEST_CHOICES,
  CHEST_COBBLES,
  CHEST_COBBLE_BPS,
  CHEST_RANKS,
  PVP_CHESTS_PER_DAY,
  TOP_LEAGUE,
  cobbleChanceBps,
  drawChest,
  leagueBoostBps,
  pvpChestGranted,
  pvpChestRank,
  storyChestRank,
  storyRankAt,
} from "./chests";
export type { ChestDraw, ChestRank } from "./chests";
export { DAY_S, SHOP_OFFERS, SHOP_PRICES, dayOf, shopEndsAt, shopOffers } from "./shop";
export type { ShopOffer } from "./shop";
export {
  DAILY_MILESTONES,
  DAILY_QUESTS,
  QUEST_BONUS_COBBLES,
  WEEKLY_MILESTONES,
  WEEKLY_QUESTS,
  dailyMilestoneClaimed,
  dailyMilestoneRefusal,
  dailyMilestoneStates,
  milestonesToClaim,
  weeklyMilestoneClaimed,
  weeklyMilestoneRefusal,
  weeklyMilestoneStates,
} from "./quests";
export type { DailyMilestone, DailyMilestoneRefusal, DailyMilestoneState, WeeklyMilestone, WeeklyMilestoneRefusal, WeeklyMilestoneState } from "./quests";
export {
  TUTORIAL_COBBLES,
  TUTORIAL_STEPS,
  TUTORIAL_TASKS,
  emptyTutorialCounts,
  tutorialCompleted,
  tutorialFinished,
  tutorialOpen,
  tutorialStates,
  tutorialStep,
  tutorialStepClaimed,
  tutorialStepRefusal,
  tutorialToClaim,
} from "./tutorial";
export type { TutorialCounts, TutorialStep, TutorialStepRefusal, TutorialStepState, TutorialTask } from "./tutorial";
