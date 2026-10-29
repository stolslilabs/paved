import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DAY_S, dayOf } from "@paved/game-core";
import { VillageChestsScene, type Chest, type ChestTaken } from "../../components/scenes/village-chests-scene";
import type { SkinsStatus } from "../../components/containers/skins-status";
import { useChests, useFreeVillage, useFreeVillageWrites } from "../../data/free-village";
import { queryKeys } from "../../data/keys";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useAppNavigate, useTabNavigate, useUpTo } from "../ref";
import { markChestsSeen } from "../chests-seen";
import { chestSlots } from "../chest-slots";
import { READY_S } from "../../components/containers/chest-slots";
import { countsByPlan, refusalText, useVillageArt } from "../village-v2";

const NO_CHESTS: readonly Chest[] = [];

/**
 * `/village/chests` (#739, PvP v2 step 1): the chests won and not opened yet, by rank, from `useChests` (the mock ledger in step
 * 1, #741). Open draws the chest picked (#784: the PvP ones first, then Story, or the slot tapped): its tiles (basic one,
 * rare 2, epic 3) and the Cobbles it may hold; the tile kept (`claimChest`) goes to the inventory. The day's PvP chests left, until the next UTC day: the slots' countdown
 * ticks with the clock, and a new day reached on the page says "Ready" for `READY_S` (#759). A chest waiting opens in the scene's
 * modal on arrival (#784), and each slot says whether its chest waits or was opened (`chestSlots`). Seeing the page marks the day seen,
 * which takes the free slots off the home's badge. A source that does not serve them (the chain before step 3) says so.
 */
export default function Page() {
  const wallet = useAccount();
  const sources = useDataSources();
  const client = useQueryClient();
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const onBack = useUpTo("/");
  // The day is the device's, as the mock ledger rules on it in step 1 (#741); step 3 (#742) reads the chain's with the contracts.
  const now = useNow();
  const me = sources.signer?.address ?? null;
  const read = useChests(me);
  const village = useFreeVillage(me);
  const writes = useFreeVillageWrites(me);
  const tileArt = useVillageArt(me);
  const [taken, setTaken] = useState<ChestTaken | null>(null);
  // Each chest opened gets its own reveal (its choice starts empty).
  const [opens, setOpens] = useState(0);
  // The day's PvP chests count from 0 at each UTC day: a new day reads them again (the read itself is not keyed by day).
  const day = dayOf(now);
  const shownDay = useRef(day);
  // The moment the new day was reached on the page: the slots say "Ready" until `READY_S` after it.
  const [resetAt, setResetAt] = useState<number | null>(null);
  useEffect(() => {
    markChestsSeen(day);
    if (shownDay.current === day) return;
    shownDay.current = day;
    setResetAt(day * DAY_S);
    if (me) void client.invalidateQueries({ queryKey: queryKeys.chain.v2.chests(me) });
  }, [day, me, client]);
  const ready = resetAt !== null && now < resetAt + READY_S;

  const data = read.data;
  // Where each chest was won (#784): today's PvP chests fill the day's slots in the order won, the first ones opened already.
  const slots = useMemo(() => (data ? chestSlots(data, day) : null), [data, day]);
  const failed = read.error;
  const status: SkinsStatus | null =
    me === null
      ? { kind: "guest" }
      : data === null
        ? { kind: "error", message: "Chests are not on this network yet." }
        : failed && data === undefined
          ? { kind: "error", message: failed.message, detail: errorDetail(failed) }
          : data === undefined
            ? { kind: "loading" }
            : null;
  const pending = writes.pending;
  const open = data?.open ?? null;

  return (
    <VillageChestsScene
      status={status}
      chests={slots?.chests ?? NO_CHESTS}
      pvpToday={data?.pvpToday ?? 0}
      pvpOpened={slots?.opened}
      ready={ready}
      resetsAt={(day + 1) * DAY_S}
      now={now}
      opened={open ? { chestId: -1 - opens, draw: { rank: open.rank, plans: open.plans, cobbles: open.cobbles > 0 ? open.cobbles : null } } : null}
      opening={pending?.kind === "open" ? (pending.index ?? 0) + 1 : null}
      taken={taken}
      busy={pending !== undefined}
      refusal={writes.error ? refusalText(writes.error) : null}
      refusalDetail={writes.error ? errorDetail(writes.error) : undefined}
      owned={village.data ? countsByPlan(village.data.inventory) : undefined}
      tileArt={tileArt}
      onBack={onBack}
      onNavigate={onNavigate}
      onPlay={() => go("/play")}
      onConnect={() => void wallet.connect()}
      onRetry={() => void client.invalidateQueries({ queryKey: queryKeys.chain.v2.all })}
      onOpen={(chestId) => {
        if (pending) return;
        writes.reset();
        setTaken(null);
        // The chest picked (#784): a chest's id is its place in the read's pending list, plus one.
        writes.openChest(chestId - 1).then(
          () => setOpens((n) => n + 1),
          () => undefined,
        );
      }}
      onTake={(_, index) => {
        if (pending || !open) return;
        writes.reset();
        const plan = open.plans[index];
        if (plan === undefined) return;
        writes.claimChest(index).then(
          () => setTaken({ plan, cobbles: open.cobbles > 0 ? open.cobbles : null }),
          () => undefined,
        );
      }}
      onDismissRefusal={writes.reset}
      onEditLayout={() => go("/?edit")}
    />
  );
}
