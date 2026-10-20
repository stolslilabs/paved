import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Definitions, PlayerAchievement } from "@paved/chain";
import { completedAtEnd } from "../lib/quest-toasts";
import { DAY_S, type ScheduledQuest } from "../lib/quest-window";
import { useDefinitions, usePlayerAchievements, usePlayerQuests } from "./indexer";
import { addressKey, queryKeys } from "./keys";

// The player's mission progress around a game (#595): read again after its moves and its game over, so the app's completion
// toasts follow it on the board, and the missions one game completed, for its game over. Out of `indexer.ts`, so the first
// load (the home's reads) does not carry it.

/**
 * Reads the player's quests (every day cached) and achievements again (#595): the app's completion toasts follow them
 * (`routes/completion-host.tsx`). Called after a confirmed move and at a game over, then again while the indexer catches up
 * (`PROGRESS_RETRY_MS`): the Challenge reports a game's progress once, at its game over (quests.md, D-24).
 */
export function refreshPlayerProgress(client: QueryClient, playerId: string): void {
  void client.invalidateQueries({ queryKey: ["indexer", "quests", addressKey(playerId)] });
  void client.invalidateQueries({ queryKey: queryKeys.indexer.achievements(playerId) });
}

/** After a game over, the reads again once the indexer has had time to ingest the block (it follows the chain by seconds). */
export const PROGRESS_RETRY_MS = [3_000, 10_000] as const;

/**
 * The missions one game completed (#595): the quests of the day it ended and the achievements whose completion is its game
 * over (`completedAtEnd`). The game's player's, read for whoever views the game (the indexer's data is public). At mount,
 * the reads are made again while the indexer catches up with the game over (`PROGRESS_RETRY_MS`); the app's completion
 * toasts follow the same reads. Empty while they load, for a game still running (`endTime` 0) and for one that completed none.
 */
export function useGameCompletions(playerId: string | null, endTime: number): { quests: ScheduledQuest[]; achievements: PlayerAchievement[]; definitions: Definitions | undefined } {
  const client = useQueryClient();
  const over = endTime > 0 && playerId !== null;
  const quests = usePlayerQuests(over ? playerId : null, over ? Math.floor(endTime / DAY_S) : null);
  const achievements = usePlayerAchievements(over ? playerId : null);
  const definitions = useDefinitions();
  useEffect(() => {
    if (!over) return;
    const timers = PROGRESS_RETRY_MS.map((ms) => setTimeout(() => refreshPlayerProgress(client, playerId), ms));
    return () => timers.forEach(clearTimeout);
  }, [over, playerId, client]);
  return {
    quests: completedAtEnd(quests.data?.quests ?? [], endTime),
    achievements: completedAtEnd(achievements.data?.achievements ?? [], endTime),
    definitions: definitions.data,
  };
}
