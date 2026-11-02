import { useMemo } from "react";
import { trackerState, type TrackerState } from "../components/containers/missions-tracker-lines";
import { DAY_S } from "../lib/quest-window";
import { usePlayerQuests } from "./indexer";
import { useIndexerNow } from "./quests";
import { useTutorialSteps } from "./tutorial-steps";

// The home's missions tracker (#978), read by its own lazy chunk (`routes/missions-count.tsx`) with the Missions count: the same
// reads (today's quests on the indexer's clock, the Tutorial's steps), so the queries are shared and the lines follow them.

/**
 * The tracker's lines for `playerId` (`trackerState`): null while the reads are on their way; `none` (a plain line to the page) for
 * a guest or on the quests' failure. Where the Tutorial is not served, or its read fails, the quests alone. Ranked on the day's
 * start, not each second of the clock: a window's end does not move within its day.
 */
export function useMissionsTracker(playerId: string | null): TrackerState | null {
  const clock = useIndexerNow();
  const day = clock.now === null ? null : Math.floor(clock.now / DAY_S);
  const quests = usePlayerQuests(playerId, day);
  const tutorial = useTutorialSteps(playerId);
  const steps = tutorial.error ? null : tutorial.data;
  const failed = clock.error !== null || quests.error !== null;
  const state: TrackerState | null =
    playerId === null || failed
      ? NONE
      : day === null || !quests.data || steps === undefined
        ? null
        : trackerState({ quests: quests.data, tutorial: steps, now: day * DAY_S });
  // The same lines keep the same object (the quests' read is joined again at each render): the home is told of a change only.
  const key = JSON.stringify(state);
  return useMemo(() => JSON.parse(key) as TrackerState | null, [key]);
}

const NONE: TrackerState = { kind: "none" };
