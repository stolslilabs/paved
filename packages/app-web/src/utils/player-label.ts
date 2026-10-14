import { useCallback, useMemo } from "react";
import { indexerPlayerId, usePaved } from "@paved/chain";
import { useWallet } from "../components/WalletProvider";
import { playerLabel, type Me } from "./indexer-view";

/**
 * The connected player: the wallet address as the indexer writes it (`0x` and 64 hex digits) and the Controller username.
 * D-25 (E): a player is the address, with no registration, so any connected wallet is a player.
 */
export function useMe(): Me {
  const { address } = usePaved();
  const username = useWallet()?.username ?? null;
  return useMemo(() => ({ id: address ? indexerPlayerId(address) : null, username }), [address, username]);
}

/**
 * `playerLabel` for the connected player: their username on their own rows; on everyone else's, the indexer's `name` when
 * the caller has it, else a short address.
 */
export function usePlayerLabel(): (id: string, name?: string | null) => string {
  const me = useMe();
  return useCallback((id: string, name?: string | null) => playerLabel(id, me, name), [me]);
}
