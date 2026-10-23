import { useParams, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deckArt } from "../../components/containers/deck-sheet";
import { shortAddress } from "../../components/elements/short-address";
import { VillageScene, type VillageStatus } from "../../components/scenes/village-scene";
import { useBoardSkins } from "../../data/board-skins";
import { cobbleKeys, useCobbleAccount } from "../../data/cobbles";
import { usePlayerStatus } from "../../data/indexer";
import { addressKey, queryKeys } from "../../data/keys";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { useDataSources } from "../../data/sources";
import { useTileArt } from "../../data/tile-art";
import { useTileRenders } from "../../data/tile-renders";
import { useVillage, useVillageReward, useVillageWrites, villageKeys } from "../../data/village";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { useAppNavigate, useBack } from "../ref";
import NotFound from "./not-found";

/** An address in a path: `0x` and 1 to 64 hex digits. */
const ADDRESS = /^0x[0-9a-f]{1,64}$/i;

/**
 * `/village` and `/village/:player` (#646 PR 2): the player's own village, or anyone's, read-only (from the PvP scout,
 * `?from=scout`, or a profile). The board, the score, the tiers and the next parcel from `Village` and `Rewards`
 * (`useVillage`), the reward from `Rewards` (`useVillageReward`), the Cobbles from the ledger. The own village writes through
 * the signer (`useVillageWrites`): Found, Buy a parcel at the price the sheet showed, Open a reward, then place one of its
 * tiles, add it as a copy, or take the Cobbles; each write shows its wait, its refusal and a toast on its receipt. The board is
 * the plan (`VillageBoard`): each placed tile on its tier's base, in its owner's active skin, the fog over the cells beyond the
 * parcels. The 3D village
 * (`VillageViewport`, #648) waits for the renderer to draw a tier's base under a tile.
 */
export default function Page() {
  const { player } = useParams();
  if (player !== undefined && !ADDRESS.test(player)) return <NotFound />;
  return <Village player={player ?? null} />;
}

function Village({ player }: { player: string | null }) {
  const go = useAppNavigate();
  const onBack = useBack();
  const wallet = useAccount();
  const sources = useDataSources();
  const [search] = useSearchParams();
  const client = useQueryClient();
  const me = sources.signer?.address ?? null;
  // A visit to one's own address is the own village.
  const own = player === null || (me !== null && addressKey(player) === addressKey(me));
  const playerId = own ? me : player;
  const profile = usePlayerStatus(own ? null : playerId);
  const owner = own ? (wallet.username ?? (me ? shortAddress(me) : "")) : (profile.data?.player.name ?? (playerId ? shortAddress(playerId) : ""));
  const read = useVillage(playerId, owner);
  const reward = useVillageReward(own ? playerId : null);
  const account = useCobbleAccount(own ? playerId : null);
  const writes = useVillageWrites(own ? playerId : null);
  // Each tile in the theme its owner made active (`active_skins`, as the boards draw them; another's only when this device
  // shows other players' skins): its top-down render, else the base art.
  const skins = useBoardSkins(playerId);
  const renders = useTileRenders(RENDERER_ASSETS);
  const tileArt = deckArt(renders, skins, useTileArt(RENDERER_ASSETS));

  // The own village's Cobbles are part of its read: the balance and the parcels' affordability come from them, so a balance
  // not read yet, or whose read failed, is never shown as 0 (Retry reads them again with the rest).
  const balanceError = own ? account.error : null;
  const failed = read.error ?? balanceError ?? null;
  const waiting = read.data === undefined || (own && account.data === undefined);
  const status: VillageStatus | null =
    own && me === null
      ? { kind: "guest" }
      : failed && (waiting || balanceError)
        ? { kind: "error", message: failed.message, detail: errorDetail(failed) }
        : waiting
          ? { kind: "loading" }
          : null;
  // The reward's own failed read: the village shows, the reward's place says what happened (Retry reads both again).
  const rewardError = reward.error ? { message: reward.error.message, detail: errorDetail(reward.error) } : null;
  const data = read.data;
  const busy = writes.pending !== undefined;

  /** A write, its toast on the receipt; a refusal stays on the page (`writes.error`) until dismissed or the next write. */
  const send = (write: () => Promise<unknown>, title: string, description?: string) => {
    if (busy) return;
    writes.reset();
    write().then(
      () => toast.success(title, description ? { description } : undefined),
      () => undefined,
    );
  };

  return (
    <VillageScene
      village={status ? undefined : (data?.village ?? null)}
      status={status}
      mode={own ? "own" : "visit"}
      from={search.get("from") === "scout" ? "scout" : "profile"}
      founded={data?.founded ?? true}
      pending={reward.data?.pending ?? 0}
      reward={reward.data?.offer ?? null}
      parcel={data?.parcel ?? null}
      cobbles={account.data?.cobbles ?? 0}
      busy={busy}
      rewardError={rewardError}
      refusal={writes.error?.message ?? null}
      refusalDetail={writes.error ? errorDetail(writes.error) : undefined}
      tileArt={tileArt}
      onBack={onBack}
      onConnect={() => void wallet.connect()}
      onRetry={() => {
        // Every read the screen joins: the village's, the Cobbles', and the owner's level (the parcels' gate, `useVillage`).
        void client.invalidateQueries({ queryKey: villageKeys.all });
        void client.invalidateQueries({ queryKey: cobbleKeys.all });
        if (playerId) void client.invalidateQueries({ queryKey: queryKeys.chain.playerLevel(playerId) });
      }}
      onDismissRefusal={writes.reset}
      onFound={() => send(writes.found, "Village founded", "Its 9 cells and the starter are yours. Open a reward to place your first tile.")}
      onOpenReward={() => send(writes.open, "Reward opened", "Choose one of its three tiles, or take the Cobbles.")}
      onPlace={(p) => send(() => writes.place(p.slot, p.orientation, { x: p.x, y: p.y }), "Tile placed", "It joins your village and counts one copy of its plan.")}
      onAddCopy={(c) => send(() => writes.merge(c.slot), "Copy added", "Its plan is one copy closer to the next tier.")}
      onTakeCobbles={() => send(writes.cobbles, `${reward.data?.offer?.cobbles ?? 0} Cobbles taken`)}
      onBuyParcel={(cell) => {
        // The price the sheet shows: the writer reads it again at send and refuses another.
        const price = data?.parcel?.price;
        if (price) send(() => writes.buyParcel(cell, price), "Parcel bought", "Your village grows by one cell.");
      }}
      onGetCobbles={() => go("/cobbles")}
      onOpenSkins={() => go("/settings/theme")}
    />
  );
}
