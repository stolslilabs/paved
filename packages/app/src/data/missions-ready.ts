import { DAILY_MILESTONES, WEEKLY_MILESTONES, milestonesToClaim, tutorialToClaim } from "@paved/game-core";
import { isClaimed } from "../components/containers/cobble-types";
import { DAY_S, questPeriod, weekOfDay } from "../lib/quest-window";
import { useQuestRewards } from "./cobbles";
import { usePlayerQuests } from "./indexer";
import { useDailyMilestones, useWeeklyMilestones } from "./milestone-reads";
import { useIndexerNow } from "./quests";
import { useTutorialSteps } from "./tutorial-steps";

// The home's Missions count (#753, #976), read by its own lazy chunk (`routes/missions-count.tsx`): the quests' rules of game-core
// and the milestones' reads stay out of the home's first load, under its budget.

/**
 * How many of today's rewards wait to be claimed (#753, the home's Missions badge): the missions completed, paying Cobbles and not
 * claimed in their period, and the gifts reached and not claimed, the day's (#869) and the week's (#976), as the Missions page
 * shows them. Since #976 no daily or weekly pays on its own, so the gifts are most of it. 0 until the reads are in, without a
 * player, or on a read's failure; a period's gifts count only where its milestones are served (the chain before #738: none). The
 * Tutorial's steps completed and not claimed (#977) count too, where the steps are served.
 */
export function useMissionsReady(playerId: string | null): number {
  const clock = useIndexerNow();
  const day = clock.now === null ? null : Math.floor(clock.now / DAY_S);
  const quests = usePlayerQuests(playerId, day);
  const rewards = useQuestRewards(playerId, day);
  const dayGifts = useDailyMilestones(playerId, day).data;
  const weekGifts = useWeeklyMilestones(playerId, day === null ? null : weekOfDay(day)).data;
  const tutorial = useTutorialSteps(playerId).data;
  const r = rewards.data;
  if (playerId === null || !quests.data || !r) return 0;
  const live = quests.data.quests;
  const missions = live.filter((q) => {
    const entry = r.cobbles.find((c) => c.questId === q.questId);
    return q.completed && entry !== undefined && entry.cobbles > 0 && !isClaimed(entry.kind === "weekly" ? r.week.claimed : r.day.claimed, q.questId);
  }).length;
  const done = (period: "daily" | "weekly") => live.filter((q) => q.completed && questPeriod(q) === period).length;
  const gifts = (dayGifts ? milestonesToClaim(DAILY_MILESTONES, done("daily"), dayGifts.claimed) : 0) + (weekGifts ? milestonesToClaim(WEEKLY_MILESTONES, done("weekly"), weekGifts.claimed) : 0);
  const steps = tutorial ? tutorialToClaim(tutorial.counts, tutorial.claimed) : 0;
  return missions + gifts + steps;
}
