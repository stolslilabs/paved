import { useCallback, useMemo, type ReactNode } from "react";
import { ProfileProvider } from "../components/containers/profile-context";
import type { ProfileState } from "../components/containers/profile-sheet";
import { savedLook, useAvatar } from "../data/avatar";
import { usePlayerStatus } from "../data/indexer";
import { usePlayerProgress } from "../data/player-progress";
import { useAccount } from "../wallet/wallet";
import { useAppNavigate } from "./ref";

/** The clipboard, or a failed copy without it (an insecure origin, an old browser). */
const copy = (text: string) => (navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error("No Clipboard API")));

/**
 * Reads who is connected once for the whole shell and hands it to the menu screens' avatar (`ProfileSlot`, #624). The profile
 * is Home's read (`usePlayerStatus`, one cache entry): before the indexer answers, the player is shown by the wallet's name or
 * address, with zero figures. The avatar is the one saved on chain (`useAvatar`, #626); Edit avatar opens the creator.
 */
export function ProfileHost({ children }: { children: ReactNode }) {
  const wallet = useAccount();
  const address = wallet.address;
  const status = usePlayerStatus(address);
  // The level and XP of the ring (#625): `Setup.player_level` (#641).
  const progress = usePlayerProgress(address);
  // The avatar the player saved on chain (#626): the same on every device. Drawn as a cached still, never a live canvas.
  const look = savedLook(useAvatar(address).data);
  const go = useAppNavigate();
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
  const onEditAvatar = useCallback(() => go("/avatar"), [go]);
  const value = useMemo(() => ({ state, progress: shown, look, onConnect, onDisconnect, onCopy: copy, onEditAvatar }), [state, shown, look, onConnect, onDisconnect, onEditAvatar]);
  return <ProfileProvider value={value}>{children}</ProfileProvider>;
}
