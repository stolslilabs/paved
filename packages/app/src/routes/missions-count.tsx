import { useEffect } from "react";
import { useMissionInProgress, type MissionProgress } from "../data/mission-progress";
import { useMissionsReady } from "../data/missions-ready";

// What waits on the Missions page (#753, #976: the missions to claim and the gifts reached, the day's and the week's), for the
// home's Missions button, and the mission in progress for its tab above the dock (HOME-EDGES): one chunk, fetched after the home, so
// that the quests' rules and reads stay out of its first load (one chunk for both: a chunk of its own for the mission moved the quests'
// shared reads into the entry's).

/** Reads the rewards of `me` waiting on the Missions page and today's first daily mission not done, and tells them; draws nothing. */
export default function MissionsCount({ me, onCount, onMission }: { me: string | null; onCount: (count: number) => void; onMission?: (mission: MissionProgress | null) => void }) {
  const count = useMissionsReady(me);
  useEffect(() => onCount(count), [count, onCount]);
  const mission = useMissionInProgress(me);
  const key = mission ? `${mission.questId}:${mission.done}/${mission.total}` : "";
  // Told when it changes, not on each render (a new object each time).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `mission`
  useEffect(() => onMission?.(mission), [key, onMission]);
  return null;
}
