import { useEffect } from "react";
import type { TrackerState } from "../components/containers/missions-tracker-lines";
import { useMissionsReady } from "../data/missions-ready";
import { useMissionsTracker } from "../data/missions-tracker";

// What waits on the Missions page (#753, #976: the missions to claim and the gifts reached, the day's and the week's), and the
// missions tracker's lines (#978), for the home: its own chunk, fetched after the home, so that the quests' rules and reads stay
// out of its first load.

/** Reads the rewards of `me` waiting on the Missions page and the tracker's lines, and tells them; draws nothing. */
export default function MissionsCount({ me, onCount, onTracker }: { me: string | null; onCount: (count: number) => void; onTracker?: (state: TrackerState | null) => void }) {
  const count = useMissionsReady(me);
  const tracker = useMissionsTracker(me);
  useEffect(() => onCount(count), [count, onCount]);
  useEffect(() => onTracker?.(tracker), [tracker, onTracker]);
  return null;
}
