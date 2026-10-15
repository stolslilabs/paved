import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CobbleAccount, PavedWriter, WriteResult } from "@paved/chain";
import { cobbleKeys } from "./cobbles";
import { queryKeys } from "./keys";
import { useDataSources, type DataSources } from "./sources";

// "Play free" (home, play): `Challenge.spawn_free()` spends one of the free-game credits (`Setup.account(player).credits`,
// earned on the quests page) and spawns a Challenge game with `GameSpawned.price` 0. The receipt gives the game's id, which
// the pages open as `/game/:id`. Nothing polls: the credits in the cache follow the receipt, then the reads it touched are
// read again.

/** The signer's free spawn, or null: no signer, or one without it (read only). */
export type FreeSigner = Pick<PavedWriter, "address" | "spawnFree">;

export function freeSigner(sources: Pick<DataSources, "signer">): FreeSigner | null {
  const signer = sources.signer as (Partial<FreeSigner> & { address: string }) | null | undefined;
  return signer && typeof signer.spawnFree === "function" ? (signer as FreeSigner) : null;
}

/**
 * Play free for the connected account. `spend()` sends the spawn and resolves with the new game's id; it resolves null,
 * sending nothing, while a spend is on its way or without a signer that can (a guest, a read only one). A refusal
 * (`NoCreditError`, `SpawnPausedError`, a rejected signature) is `error`, and `spend` rejects with it. After a receipt the
 * credits in the cache go down by one and the player's games are read again; after a refusal the credits and the pause are
 * (the chain's answer may differ from the page's).
 */
export function usePlayFree(playerId: string | null) {
  const sources = useDataSources();
  const spender = freeSigner(sources);
  const client = useQueryClient();
  const mutation = useMutation<WriteResult & { gameId: number }, Error, void>({
    mutationFn: () => (spender ? spender.spawnFree() : Promise.reject(new Error("Connect to play free"))),
    onSuccess: () => {
      if (playerId) client.setQueryData<CobbleAccount | null>(cobbleKeys.account(playerId), (a) => (a ? { ...a, credits: Math.max(0, a.credits - 1) } : a));
    },
    onSettled: (_result, error) => {
      void client.invalidateQueries({ queryKey: cobbleKeys.all });
      if (!error && playerId) {
        void client.invalidateQueries({ queryKey: queryKeys.chain.activeGame(playerId) });
        void client.invalidateQueries({ queryKey: queryKeys.chain.playerGames(playerId) });
      } else {
        void client.invalidateQueries({ queryKey: queryKeys.chain.spawnPaused() });
      }
    },
  });
  return {
    /** A signer that can spend a credit is connected. */
    available: spender !== null,
    spending: mutation.isPending,
    error: mutation.error,
    spend: async (): Promise<number | null> => {
      if (!spender || mutation.isPending) return null;
      return (await mutation.mutateAsync()).gameId;
    },
  };
}
