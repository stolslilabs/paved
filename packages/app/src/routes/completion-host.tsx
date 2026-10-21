import { useMemo } from "react";
import { useCompletionToasts, type CompletionToast } from "../components/containers/completion-toasts";
import { achievementText, questText } from "../components/containers/quest-text";
import { achievementCobbles, questCobbles } from "../data/cobbles";
import { useCompletionMemory } from "../data/completion-memory";
import { useDefinitions, usePlayerAchievements, usePlayerQuests } from "../data/indexer";
import { useIndexerNow } from "../data/quests";
import { DAY_S } from "../lib/quest-window";
import type { Trackable } from "../lib/quest-toasts";

/** A list as tracked, kept while its ids, intervals and completions stay: a refresh of the same progress changes nothing. */
function useTracked(list: readonly Trackable[] | undefined): Trackable[] | null {
  const signature = list ? list.map((t) => `${t.id}:${t.intervalId ?? 0}:${Number(t.completed)}`).join(",") : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the signature: a new array of the same progress is no change
  return useMemo(() => (list ? list.map(({ id, intervalId, completed }) => ({ id, intervalId, completed })) : null), [signature]);
}

/**
 * The completion toasts, app-wide (#595): mounted once by `App.tsx`, beside the `Toaster`, for a signer (a guest has nothing
 * to track), and loaded as its own chunk then (the bundle rule: the first load does not carry it), so a mission (a quest or an
 * achievement) completed while the player is on the board, or anywhere else, toasts there: its title, icon and Cobbles.
 * It reads today's quests and the achievements of the signer (the indexer's, on its clock) on the usual refreshes (focus,
 * a claim's receipt) and on `refreshPlayerProgress`, which the over page calls at a game over. The memory is the app's (`useCompletionMemory`), so the Missions pages' reads of the same keys toast nothing
 * twice.
 */
export default function CompletionTracker({ playerId }: { playerId: string }) {
  const { now } = useIndexerNow();
  const today = now === null ? null : Math.floor(now / DAY_S);
  const quests = usePlayerQuests(playerId, today);
  const achievements = usePlayerAchievements(playerId);
  const definitions = useDefinitions();

  const trackedQuests = useTracked(quests.data?.quests.map((q) => ({ id: q.questId, intervalId: q.intervalId, completed: q.completed })));
  const trackedAchievements = useTracked(achievements.data?.achievements.map((a) => ({ id: a.achievementId, completed: a.completed })));

  const defs = definitions.data;
  const describeQuest = ({ id }: Trackable): CompletionToast => {
    const { title, icon } = questText(id);
    return { title, icon, cobbles: defs ? questCobbles(defs).find((c) => c.questId === id)?.cobbles : undefined };
  };
  const describeAchievement = ({ id }: Trackable): CompletionToast => {
    const { title, icon } = achievementText(id);
    const points = achievements.data?.achievements.find((a) => a.achievementId === id)?.points;
    return { title, icon, description: points != null ? `+${points} pts` : undefined, cobbles: defs ? achievementCobbles(defs).find((c) => c.achievementId === id)?.cobbles : undefined };
  };

  const questMemory = useCompletionMemory(playerId, "quest");
  const achievementMemory = useCompletionMemory(playerId, "achievement");
  useCompletionToasts("quest", trackedQuests, describeQuest, { scope: today ?? undefined, live: today !== null, memory: questMemory });
  useCompletionToasts("achievement", trackedAchievements, describeAchievement, { memory: achievementMemory });
  return null;
}
