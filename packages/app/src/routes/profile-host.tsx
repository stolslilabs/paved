import { useCallback, useMemo, type ReactNode } from "react";
import { ProfileProvider } from "../components/containers/profile-context";
import type { ProfileState } from "../components/containers/profile-sheet";
import { usePlayerStatus } from "../data/indexer";
import { usePlayerProgress } from "../data/player-progress";
import { useAccount } from "../wallet/wallet";

/** The clipboard, or a failed copy without it (an insecure origin, an old browser). */
const copy = (text: string) => (navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error("No Clipboard API")));

/**
 * Reads who is connected once for the whole shell and hands it to the menu screens' avatar (`ProfileSlot`, #624). The profile
 * is Home's read (`usePlayerStatus`, one cache entry): before the indexer answers, the player is shown by the wallet's name or
 * address, with zero figures.
 */
export function ProfileHost({ children }: { children: ReactNode }) {
  const wallet = useAccount();
  const address = wallet.address;
  const status = usePlayerStatus(address);
  // The level and XP of the ring (#625): level 1 and 0 XP for everyone until the contracts define XP.
  const progress = usePlayerProgress(address);
  const state = useMemo<ProfileState>(() => {
    if (wallet.status === "restoring") return { status: "loading" };
    if (!address) return { status: "guest", connecting: wallet.status === "connecting" };
    return {
      status: "connected",
      data: status.data ?? {
        player: { playerId: address, name: wallet.username, created: null },
        stats: { challengeGames: 0, challengeFinished: 0, bestScore: 0, paidGames: 0, settledGames: 0, rewards: "0" },
      },
    };
  }, [wallet.status, wallet.username, address, status.data]);
  const onConnect = useCallback(() => void wallet.connect(), [wallet]);
  const onDisconnect = useCallback(() => wallet.disconnect(), [wallet]);
  const shown = progress.isPending ? undefined : (progress.data ?? undefined);
  const value = useMemo(() => ({ state, progress: shown, onConnect, onDisconnect, onCopy: copy }), [state, shown, onConnect, onDisconnect]);
  return <ProfileProvider value={value}>{children}</ProfileProvider>;
}
