import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DAY_S, dayOf } from "@paved/game-core";
import { VillageShopScene } from "../../components/scenes/village-shop-scene";
import type { SkinsStatus } from "../../components/containers/skins-status";
import { tileName } from "../../components/elements/tile-render";
import { cobbleKeys, useCobbleAccount } from "../../data/cobbles";
import { useFreeVillage, useFreeVillageWrites, useShop } from "../../data/free-village";
import { queryKeys } from "../../data/keys";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useAppNavigate, useUpTo } from "../ref";
import { countsByPlan, refusalText, useVillageArt } from "../village-v2";

/**
 * `/village/shop` (#739, PvP v2 step 1): the day's 3 base plans from `useShop` (the mock ledger in step 1, #741), each with its
 * rarity and price, bought once a day at the price shown (`buy`); the tile goes to the inventory. The day is the device's clock
 * (the mock's, step 1), the time left is until the next UTC day. Short of Cobbles, Get Cobbles leads to the packs.
 */
export default function Page() {
  const wallet = useAccount();
  const sources = useDataSources();
  const client = useQueryClient();
  const go = useAppNavigate();
  const onBack = useUpTo("/");
  // The day is the device's, as the mock ledger rules on it in step 1 (#741); step 3 (#742) reads the chain's with the contracts.
  const now = useNow();
  const me = sources.signer?.address ?? null;
  const day = dayOf(now);
  const read = useShop(me, day);
  const village = useFreeVillage(me);
  const account = useCobbleAccount(me);
  const writes = useFreeVillageWrites(me);
  const tileArt = useVillageArt(me);

  const data = read.data;
  const failed = read.error ?? account.error ?? null;
  const waiting = data === undefined || account.data === undefined;
  const status: SkinsStatus | null =
    me === null
      ? { kind: "guest" }
      : data === null
        ? { kind: "error", message: "The tile shop is not on this network yet." }
        : failed
          ? { kind: "error", message: failed.message, detail: errorDetail(failed) }
          : waiting
            ? { kind: "loading" }
            : null;
  const offers = data?.offers ?? [];
  const pending = writes.pending;

  return (
    <VillageShopScene
      status={status}
      offers={offers.map((o) => ({ plan: o.plan, rarity: o.rarity, price: o.price, bought: o.bought }))}
      cobbles={account.data?.cobbles ?? 0}
      owned={village.data ? countsByPlan(village.data.inventory) : {}}
      resetsAt={data?.endsAt ?? (day + 1) * DAY_S}
      now={now}
      buying={pending?.kind === "buy" ? offers.findIndex((o) => o.slot === pending.request.slot) : null}
      refusal={writes.error ? refusalText(writes.error) : null}
      refusalDetail={writes.error ? errorDetail(writes.error) : undefined}
      tileArt={tileArt}
      onBack={onBack}
      onConnect={() => void wallet.connect()}
      onRetry={() => {
        void client.invalidateQueries({ queryKey: queryKeys.chain.v2.all });
        void client.invalidateQueries({ queryKey: cobbleKeys.all });
      }}
      onBuy={(index) => {
        const offer = offers[index];
        if (pending || !data || !offer || offer.bought) return;
        writes.reset();
        writes.buy({ day: data.day, slot: offer.slot, confirmedPrice: offer.price }).then(
          () => toast.success(`${tileName(offer.plan)} bought`, { description: "It is in your inventory: place it in the editor." }),
          () => undefined,
        );
      }}
      onGetCobbles={() => go("/cobbles")}
      onDismissRefusal={writes.reset}
    />
  );
}
