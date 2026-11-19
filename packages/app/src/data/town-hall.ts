import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WriteResult } from "@paved/chain";
import { invalidateV2, type TownHallWrites, type UpgradeTownHallRequest } from "./free-village-base";
import { useDataSources, type DataSources } from "./sources";

// The Town Hall's upgrade (TOWN-HALL): its next level, for Cobbles, with the player level it asks for (game-core's
// `townHallRefusal`). Its level is read with the village (`FreeVillageView.townHall`). Served by the mock ledger; the chain's
// signer has no such write yet, so the hook is read only there.

/** The signer's Town Hall write, or null where it has none (the chain before the contracts). */
export function townHallSigner(sources: Pick<DataSources, "signer">): TownHallWrites | null {
  const s = sources.signer as (Partial<TownHallWrites> & { address: string }) | null | undefined;
  return s && typeof s.upgradeTownHall === "function" ? (s as TownHallWrites) : null;
}

/**
 * The upgrade of the connected account's Town Hall. It invalidates the village side once settled (the village and its slots,
 * the Cobbles), a refusal too. `pending` while it is on its way, `error` the last refusal (`V2RefusedError`) until `reset`;
 * `signer` null: read only.
 */
export function useTownHallWrites(playerId: string | null) {
  const signer = townHallSigner(useDataSources());
  const client = useQueryClient();
  const mutation = useMutation<WriteResult, Error, UpgradeTownHallRequest>({
    mutationFn: (request) => (signer ? signer.upgradeTownHall(request) : Promise.reject(new Error("Connect to upgrade your Town Hall"))),
    onSettled: () => {
      if (playerId) invalidateV2(client, playerId);
    },
  });
  return {
    signer,
    pending: mutation.isPending,
    error: mutation.error,
    reset: () => mutation.reset(),
    upgrade: (request: UpgradeTownHallRequest) => mutation.mutateAsync(request),
  };
}
