import { useMemo, useState } from "react";
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
import { useAppNavigate, useUpTo } from "../ref";
import { countsByPlan, refusalText, useVillageArt } from "../village-v2";

/**
 * `/village/chests` (#739, PvP v2 step 1): the chests won and not opened yet, by rank, from `useChests` (the mock ledger in step
 * 1, #741). They open in the order won: Open draws the oldest's tiles (bronze one, silver 2, gold 3) and the Cobbles it may hold;
 * the tile kept (`claimChest`) goes to the inventory. The day's PvP chests left, until the next UTC day. A source that does not
 * serve them (the chain before step 3) says so.
 */
export default function Page() {
  const wallet = useAccount();
  const sources = useDataSources();
  const client = useQueryClient();
  const go = useAppNavigate();
  const onBack = useUpTo("/village");
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

  const data = read.data;
  const chests = useMemo<Chest[]>(() => (data ? data.pending.map((rank, i) => ({ id: i + 1, rank })) : []), [data]);
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
      chests={chests}
      inOrder
      pvpToday={data?.pvpToday ?? 0}
      resetsAt={(dayOf(now) + 1) * DAY_S}
      now={now}
      opened={open ? { chestId: -1 - opens, draw: { rank: open.rank, plans: open.plans, cobbles: open.cobbles > 0 ? open.cobbles : null } } : null}
      opening={pending?.kind === "open" ? 1 : null}
      taken={taken}
      busy={pending !== undefined}
      refusal={writes.error ? refusalText(writes.error) : null}
      refusalDetail={writes.error ? errorDetail(writes.error) : undefined}
      owned={village.data ? countsByPlan(village.data.inventory) : undefined}
      tileArt={tileArt}
      onBack={onBack}
      onConnect={() => void wallet.connect()}
      onRetry={() => void client.invalidateQueries({ queryKey: queryKeys.chain.v2.all })}
      onOpen={() => {
        if (pending) return;
        writes.reset();
        setTaken(null);
        writes.openChest().then(
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
      onEditLayout={() => go("/village")}
    />
  );
}
