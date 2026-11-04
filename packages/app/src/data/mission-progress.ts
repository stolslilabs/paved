import { questText } from "../components/containers/quest-text";
import { DAY_S, questPeriod } from "../lib/quest-window";
import { usePlayerQuests } from "./indexer";
import { useIndexerNow } from "./quests";

// The mission in progress on the home (HOME-EDGES, the Paved UX Book's main screen), read by the Missions count's lazy chunk
// (`routes/missions-count.tsx`): the quests' reads stay out of the home's first load.

/** A mission under way: its title, its task (what to do), the tasks' counts made and their totals summed. */
export interface MissionProgress {
  questId: number;
  title: string;
  /** What to do: the description's first clause ("Score roads and cities in a day"); what follows a colon names the target's tier. */
  task: string;
  done: number;
  total: number;
}

/** A mission's task: its description up to a colon, without the final full stop. */
export const missionTask = (description: string) => description.split(":")[0]!.replace(/\.$/, "").trim();

/**
 * Today's first daily mission not completed, as the Missions page opens on it (the first mission not done, Daily first): its title
 * and progress. None without a player, while read, on a read's failure, or with every daily done.
 */
export function useMissionInProgress(playerId: string | null): MissionProgress | null {
  const clock = useIndexerNow();
  const day = clock.now === null ? null : Math.floor(clock.now / DAY_S);
  const quests = usePlayerQuests(playerId, day);
  if (playerId === null || !quests.data) return null;
  const open = quests.data.quests.find((q) => questPeriod(q) === "daily" && !q.completed && !q.retired);
  if (!open) return null;
  const total = open.tasks.reduce((sum, t) => sum + t.total, 0);
  const done = open.tasks.reduce((sum, t) => sum + Math.min(t.count, t.total), 0);
  const text = questText(open.questId);
  return { questId: open.questId, title: text.title, task: missionTask(text.description), done, total };
}
