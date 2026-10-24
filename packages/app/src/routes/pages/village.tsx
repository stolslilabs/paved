import { Suspense, lazy, useCallback, useContext, useMemo, useState } from "react";
import { UNSAFE_DataRouterContext, useBlocker, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { layoutScore } from "@paved/game-core";
import type { BoardTile } from "@paved/chain";
import { shortAddress } from "../../components/elements/short-address";
import { VillageLayoutScene, type LayoutSaved, type VillageLayoutStatus } from "../../components/scenes/village-layout-scene";
import type { VillageLayout } from "../../components/containers/layout-rules";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { cobbleKeys, useCobbleAccount } from "../../data/cobbles";
import { useChests, useFreeVillage, useFreeVillageWrites } from "../../data/free-village";
import { usePlayerStatus } from "../../data/indexer";
import { addressKey, queryKeys } from "../../data/keys";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { useAppNavigate, useBack } from "../ref";
import { boardTilesOf, countsByPlan, layoutTilesOf, refusalText, useVillageArt } from "../village-v2";
import NotFound from "./not-found";

/** An address in a path: `0x` and 1 to 64 hex digits. */
const ADDRESS = /^0x[0-9a-f]{1,64}$/i;

/** The v1 village, its own chunk: only for a source that does not serve PvP v2's village yet (the chain before step 3). */
const VillageV1 = lazy(() => import("./village-v1"));

/**
 * `/village` and `/village/:player` (#739, PvP v2 step 1): the player's own village, or anyone's, read-only. The free layout,
 * its score, the level and slots, and the inventory from `useFreeVillage` (the mock ledger in step 1, #741), the chests waiting
 * from `useChests`, the Cobbles from the ledger. The own village founds itself (its starter layout) and saves the editor's whole
 * layout at once (`useFreeVillageWrites`); the score shown once saved is game-core's (`layoutScore`). Leaving the page with
 * unsaved changes, by any way, asks first. Chests and Shop lead to `/village/chests` and `/village/shop`. A source that does not
 * serve the v2 village (its read answers null) keeps the v1 village (`village-v1.tsx`) until step 3 wires the chain.
 */
export default function Page() {
  const { player } = useParams();
  if (player !== undefined && !ADDRESS.test(player)) return <NotFound />;
  return <Village player={player ?? null} />;
}

function Village({ player }: { player: string | null }) {
  const onBack = useBack();
  const go = useAppNavigate();
  const wallet = useAccount();
  const sources = useDataSources();
  const client = useQueryClient();
  const me = sources.signer?.address ?? null;
  // A visit to one's own address is the own village.
  const own = player === null || (me !== null && addressKey(player) === addressKey(me));
  const playerId = own ? me : player;
  const profile = usePlayerStatus(own ? null : playerId);
  const owner = own ? (wallet.username ?? (me ? shortAddress(me) : "")) : (profile.data?.player.name ?? (playerId ? shortAddress(playerId) : ""));
  const read = useFreeVillage(playerId);
  const chests = useChests(own ? playerId : null);
  const account = useCobbleAccount(own ? playerId : null);
  const writes = useFreeVillageWrites(own ? playerId : null);
  const tileArt = useVillageArt(playerId);
  const [saved, setSaved] = useState<LayoutSaved | null>(null);
  const [dirty, setDirty] = useState(false);
  // The app's router is a data router, so leaving by any way is guarded; a plain one (Storybook's) has only the editor's Back.
  const guarded = useContext(UNSAFE_DataRouterContext) !== null;
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  const data = read.data;
  const village = useMemo<VillageLayout | undefined>(
    () => (data ? { owner, level: data.level, tiles: boardTilesOf(data.tiles), score: data.score } : undefined),
    [data, owner],
  );
  const inventory = useMemo(() => (data ? countsByPlan(data.free) : {}), [data]);

  // Not served (the chain before step 3): the v1 village, as before.
  if (data === null && playerId !== null) {
    return (
      <Suspense fallback={null}>
        <VillageV1 player={player} />
      </Suspense>
    );
  }

  // The own village's Cobbles are part of its read: a balance not read yet, or whose read failed, is never shown as 0.
  const balanceError = own ? account.error : null;
  const failed = read.error ?? balanceError ?? null;
  const waiting = data === undefined || (own && account.data === undefined);
  const status: VillageLayoutStatus | null =
    own && me === null
      ? { kind: "guest" }
      : failed && (waiting || balanceError)
        ? { kind: "error", message: failed.message, detail: errorDetail(failed) }
        : waiting
          ? { kind: "loading" }
          : null;
  const pending = writes.pending?.kind;

  const save = (tiles: readonly BoardTile[]) => {
    if (pending || !village) return;
    writes.reset();
    const layout = layoutTilesOf(tiles);
    const previous = village.score;
    writes.save(layout).then(
      () => setSaved({ score: layoutScore(layout), previous }),
      () => undefined,
    );
  };
  const found = () => {
    if (pending) return;
    writes.reset();
    writes.found().then(
      () => toast.success("Village founded", { description: "Its starter layout is yours. Edit it at any time." }),
      () => undefined,
    );
  };

  return (
    <>
      <VillageLayoutScene
        village={status ? undefined : village}
        status={status}
        mode={own ? "own" : "visit"}
        founded={data?.founded ?? true}
        founding={pending === "found"}
        inventory={inventory}
        cobbles={account.data?.cobbles ?? 0}
        chests={(chests.data?.pending.length ?? 0) + (chests.data?.open ? 1 : 0)}
        saving={pending === "save"}
        saved={saved}
        refusal={writes.error ? refusalText(writes.error) : null}
        refusalDetail={writes.error ? errorDetail(writes.error) : undefined}
        tileArt={tileArt}
        onBack={onBack}
        onConnect={() => void wallet.connect()}
        onRetry={() => {
          void client.invalidateQueries({ queryKey: queryKeys.chain.v2.all });
          void client.invalidateQueries({ queryKey: cobbleKeys.all });
        }}
        onSave={save}
        onFound={found}
        onDirtyChange={onDirtyChange}
        onDismissSaved={() => setSaved(null)}
        onDismissRefusal={writes.reset}
        onOpenChests={() => go("/village/chests")}
        onOpenShop={() => go("/village/shop")}
      />
      {guarded && <LeaveGuard when={dirty} />}
    </>
  );
}

/** Leaving the page with the editor's changes unsaved (a tab, the system Back, a link) asks first. */
function LeaveGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(when);
  return (
    <Dialog open={blocker.state === "blocked"} onOpenChange={(open) => !open && blocker.reset?.()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave without saving?</DialogTitle>
          <DialogDescription>Your changes to the layout are lost; the village stays as it was saved.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => blocker.reset?.()}>
            Keep editing
          </Button>
          <Button variant="destructive" onClick={() => blocker.proceed?.()}>
            Leave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
