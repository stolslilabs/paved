import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { WriteResult } from "@paved/chain";
import {
  CAMPAIGNS,
  EMPTY_PROGRESS,
  STORY_KEY,
  StoryRun,
  campaignRequirement,
  campaignUnlocked,
  loadProgress,
  recordRun,
  saveProgress,
  type KeyValueStore,
  type StoryCampaign,
  type StoryLevel,
  type StoryProgress,
  type StorySnapshot,
} from "@paved/game-core";
import { queryKeys } from "./keys";
import { trainingStore, useDataSources } from "./sources";

/** A level of the plan by its campaign and index (from 1); null when there is none. */
export function findLevel(campaignId: number, levelIndex: number): { campaign: StoryCampaign; level: StoryLevel } | null {
  const campaign = CAMPAIGNS.find((c) => c.id === campaignId);
  const level = campaign?.levels.find((l) => l.id === levelIndex);
  return campaign && level ? { campaign, level } : null;
}

/** The level after `levelIndex` of `campaignId`: the next of its campaign, or the first of the next campaign; null after the last. */
export function nextLevel(campaignId: number, levelIndex: number): { campaignId: number; levelIndex: number } | null {
  if (findLevel(campaignId, levelIndex + 1)) return { campaignId, levelIndex: levelIndex + 1 };
  if (findLevel(campaignId + 1, 1)) return { campaignId: campaignId + 1, levelIndex: 1 };
  return null;
}

export const levelPath = (campaignId: number, levelIndex: number) => `/story/${campaignId}/${levelIndex}`;

/**
 * The progress of each store, kept across the routes (the campaign list and a level read the same object). A write saves
 * it; with storage off it lives for the page. Another tab's write (the `storage` event) is read again.
 */
const held = new WeakMap<() => KeyValueStore | null, { progress: StoryProgress; saved: boolean; listeners: Set<() => void> }>();

function entry(store: () => KeyValueStore | null) {
  let found = held.get(store);
  if (!found) {
    found = { progress: loadProgress(store), saved: true, listeners: new Set() };
    held.set(store, found);
  }
  return found;
}

/**
 * The Story progress of this device (#546): the best score, stars and best run of each level. `record` keeps a finished
 * run (the stars never go down); `saved` is false when the browser refused the last write.
 */
export function useStoryProgress(): {
  progress: StoryProgress;
  saved: boolean;
  record: (level: StoryLevel, run: ReturnType<StoryRun["submission"]>, score: number) => void;
} {
  const store = trainingStore(useDataSources());
  const state = entry(store);
  const subscribe = useCallback(
    (listener: () => void) => {
      state.listeners.add(listener);
      return () => state.listeners.delete(listener);
    },
    [state],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state.progress,
    () => EMPTY_PROGRESS,
  );

  useEffect(() => {
    const follow = (event: StorageEvent) => {
      if (event.key !== STORY_KEY) return;
      state.progress = loadProgress(store);
      for (const listener of state.listeners) listener();
    };
    window.addEventListener("storage", follow);
    return () => window.removeEventListener("storage", follow);
  }, [state, store]);

  const record = useCallback(
    (level: StoryLevel, run: ReturnType<StoryRun["submission"]>, score: number) => {
      const next = recordRun(state.progress, level, run, score);
      if (next === state.progress) return;
      state.progress = next;
      state.saved = saveProgress(next, store);
      for (const listener of state.listeners) listener();
    },
    [state, store],
  );
  return { progress: snapshot, saved: state.saved, record };
}

/** Where the device keeps the campaigns whose unlock it has shown (#592): their ids, as a JSON array. */
export const UNLOCKS_KEY = "paved:story-unlocks:v1";

/** The ids shown per store when the browser refuses storage: the animation then plays once per page, not on every visit. */
const shownHere = new WeakMap<() => KeyValueStore | null, Set<number>>();

function readShown(store: () => KeyValueStore | null): Set<number> {
  const memory = shownHere.get(store) ?? new Set<number>();
  shownHere.set(store, memory);
  try {
    const raw = store()?.getItem(UNLOCKS_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === "number") memory.add(id);
  } catch {
    // A refused or broken read: what this page has shown stands.
  }
  return memory;
}

/**
 * The campaigns that opened since this device last showed the campaign list (#592): their cards play the unlock once (the
 * lock goes, the blur lifts). A campaign open from the start (no stars asked) never plays it. Read once per mount; the
 * effect then records them, so the next visit shows them open at once.
 */
export function useCampaignUnlocks(campaigns: readonly StoryCampaign[], progress: StoryProgress): readonly number[] {
  const store = trainingStore(useDataSources());
  const [fresh] = useState(() => {
    const shown = readShown(store);
    return campaigns.filter((c) => campaignRequirement(campaigns, c).needed > 0 && campaignUnlocked(progress, campaigns, c) && !shown.has(c.id)).map((c) => c.id);
  });
  useEffect(() => {
    if (fresh.length === 0) return;
    const shown = readShown(store);
    for (const id of fresh) shown.add(id);
    try {
      store()?.setItem(UNLOCKS_KEY, JSON.stringify([...shown].sort((a, b) => a - b)));
    } catch {
      // Storage off: the page's memory keeps it.
    }
  }, [fresh, store]);
  return fresh;
}

/** Where the device keeps the levels whose deck it has presented (#593): their `campaign-level` keys, as a JSON array. */
export const PRESENTED_KEY = "paved:story-decks:v1";

/** The keys presented per store when the browser refuses storage: the presentation then shows once per page. */
const presentedHere = new WeakMap<() => KeyValueStore | null, Set<string>>();

function readPresented(store: () => KeyValueStore | null): Set<string> {
  const memory = presentedHere.get(store) ?? new Set<string>();
  presentedHere.set(store, memory);
  try {
    const raw = store()?.getItem(PRESENTED_KEY);
    const keys: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(keys)) for (const key of keys) if (typeof key === "string") memory.add(key);
  } catch {
    // A refused or broken read: what this page has presented stands.
  }
  return memory;
}

/**
 * Whether this device has presented the deck of a level (#593): read once per mount, so a level opens on its presentation
 * the first time only; `markPresented` records it (a replay, or the next visit, goes straight to the board).
 */
export function useDeckPresented(campaignId: number, levelIndex: number): { presented: boolean; markPresented: () => void } {
  const store = trainingStore(useDataSources());
  const key = `${campaignId}-${levelIndex}`;
  const [presented] = useState(() => readPresented(store).has(key));
  const markPresented = useCallback(() => {
    const shown = readPresented(store);
    if (shown.has(key)) return;
    shown.add(key);
    try {
      store()?.setItem(PRESENTED_KEY, JSON.stringify([...shown]));
    } catch {
      // Storage off: the page's memory keeps it.
    }
  }, [store, key]);
  return { presented, markPresented };
}

/** A run of `level`, one per mounted level page: its engine kept between moves, `restart` starts the level again. */
export function useStoryRun(campaign: StoryCampaign, level: StoryLevel): { run: StoryRun; snapshot: StorySnapshot } {
  const [run] = useState(() => new StoryRun(campaign, level));
  const subscribe = useCallback((listener: () => void) => run.subscribe(listener), [run]);
  const snapshot = useSyncExternalStore(subscribe, () => run.snapshot, () => run.snapshot);
  return { run, snapshot };
}

/** The task the claim credits: `TUTORIAL_FINISHED` (quests.md), which completes First Stone. */
export const TUTORIAL_TASK = 10;

/**
 * The outcome of one `Setup.claim_tutorial()`. The call is idempotent (D-21, P-49): the first emits
 * `AchievementProgressed { task 10 }`, a later one nothing, so the receipt tells them apart.
 */
export function claimOutcome(result: WriteResult): "claimed" | "already-claimed" {
  const credited = result.events.some((e) => e.name === "AchievementProgressed" && Number(e.fields.taskId) === TUTORIAL_TASK);
  return credited ? "claimed" : "already-claimed";
}

/** `Setup.tutorial_claimed(player)`: a claim made before needs no transaction. Disabled without a player. */
export function useTutorialClaimed(playerId: string | null): UseQueryResult<boolean> {
  const { views } = useDataSources();
  return useQuery({
    queryKey: queryKeys.chain.tutorialClaimed(playerId ?? "0x0"),
    queryFn: () => views.tutorialClaimed(playerId as string),
    enabled: playerId !== null,
  });
}

/**
 * First Stone (D-21), claimed with the signer's `claimTutorial` once Tutorial level 1 is finished (#546). Without a signer
 * it is refused before anything is sent (the page offers Connect instead). A claim sets the claimed read.
 */
export function useTutorialClaim() {
  const { signer = null } = useDataSources();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!signer) throw new Error("Connect a wallet to claim First Stone.");
      return { address: signer.address, outcome: claimOutcome(await signer.claimTutorial()) };
    },
    onSuccess: ({ address }) => queryClient.setQueryData(queryKeys.chain.tutorialClaimed(address), true),
  });
}
