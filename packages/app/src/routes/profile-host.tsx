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
 * address, with zero figures; the indexer's name, else the wallet's. The avatar is the one saved on chain (`useAvatar`, #626); Edit avatar opens the creator (the village is the home, #753), Battle logs the PvP league and its battle logs (#647, #834), Tiles the player's tiles and Invite the referral (PROFILE-DRAWER).
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
    // The indexer's name, else the wallet's (the mock's drawn name, #926): an account made since #920 has none on the indexer.
    return {
      status: "connected",
      data: status.data
        ? { ...status.data, player: { ...status.data.player, name: status.data.player.name ?? wallet.username } }
        : {
            player: { playerId: address, name: wallet.username, created: null },
            stats: { challengeGames: 0, challengeFinished: 0, bestScore: 0, paidGames: 0, settledGames: 0, rewards: "0" },
          },
    };
  }, [wallet.status, wallet.username, address, status.data]);
  const onConnect = useCallback(() => void wallet.connect(), [wallet]);
  const shown = progress.isPending ? undefined : (progress.data ?? undefined);
  const onEditAvatar = useCallback(() => go("/avatar"), [go]);
  const onOpenLeague = useCallback(() => go("/pvp/league"), [go]);
  // The profile's Tiles and Invite (PROFILE-DRAWER): the player's tiles and the referral, Settings' sheets.
  const onOpenTiles = useCallback(() => go("/tiles"), [go]);
  const onOpenInvite = useCallback(() => go("/referral"), [go]);
  const value = useMemo(
    () => ({ state, progress: shown, look, onConnect, onCopy: copy, onEditAvatar, onOpenLeague, onOpenTiles, onOpenInvite }),
    [state, shown, look, onConnect, onEditAvatar, onOpenLeague, onOpenTiles, onOpenInvite],
  );
  return <ProfileProvider value={value}>{children}</ProfileProvider>;
}
