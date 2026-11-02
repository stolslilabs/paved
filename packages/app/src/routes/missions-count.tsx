import { useEffect } from "react";
import { useMissionsReady } from "../data/missions-ready";

// What waits on the Missions page (#753, #976: the missions to claim and the gifts reached, the day's and the week's), for the
// home's Missions button: its own chunk, fetched after the home, so that the quests' rules and reads stay out of its first load.

/** Reads the rewards of `me` waiting on the Missions page, and tells their count; draws nothing. */
export default function MissionsCount({ me, onCount }: { me: string | null; onCount: (count: number) => void }) {
  const count = useMissionsReady(me);
  useEffect(() => onCount(count), [count, onCount]);
  return null;
}
