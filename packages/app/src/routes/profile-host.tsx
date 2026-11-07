import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { ProfileProvider } from "../components/containers/profile-context";
import type { ProfileState } from "../components/containers/profile-sheet";
import { savedLook, useAvatar, usePlayerName } from "../data/avatar";
import { usePlayerStatus } from "../data/indexer";
import { usePlayerProgress } from "../data/player-progress";
import { useAccount } from "../wallet/wallet";
import { useAppNavigate } from "./ref";

/** The clipboard, or a failed copy without it (an insecure origin, an old browser). */
const copy = (text: string) => (navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error("No Clipboard API")));

/**
 * Reads who is connected once for the whole shell and hands it to the menu screens' avatar (`ProfileSlot`, #624). The profile
 * is Home's read (`usePlayerStatus`, one cache entry): before the indexer answers, the player is shown by the wallet's name or
 * address, with zero figures; the name set on chain (PLAYER-RENAME, `usePlayerName`: a rename shows at once, before the indexer
 * has its block), else the indexer's, else the wallet's. The avatar is the one saved on chain (`useAvatar`, #626); Edit avatar opens the creator (the village is the home, #753), Battle logs the PvP league and its battle logs (#647, #834), Tiles the player's tiles and Invite the referral (PROFILE-DRAWER).
 */
export function ProfileHost({ children }: { children: ReactNode }) {
  const wallet = useAccount();
  const address = wallet.address;
  const status = usePlayerStatus(address);
  // PLAYER-RENAME: the name set on chain wins over the Cartridge username, the indexer's and the wallet's.
  const chainName = usePlayerName(address);
  // The level and XP of the ring (#625): `Setup.player_level` (#641).
  const progress = usePlayerProgress(address);
  // The avatar the player saved on chain (#626): the same on every device. Drawn as a cached still, never a live canvas.
  const look = savedLook(useAvatar(address).data);
  const go = useAppNavigate();
  // AVATAR-PAGE: asked open again by the editor's Back; opened once the village is the page (`/`), not over a drawer still sliding
  // out. A player's link (`?player=`, the own profile opened by a link) opens it itself. The path, not the route's page: the route map's
  // reader is a chunk of its own, and the first load would split around it.
  const { pathname, search } = useLocation();
  const [asked, setAsked] = useState(false);
  const [opening, setOpening] = useState(0);
  if (asked && pathname === "/") {
    setAsked(false);
    if (!new URLSearchParams(search).has("player")) setOpening(opening + 1);
  }
  const reopen = useCallback(() => setAsked(true), []);
  const state = useMemo<ProfileState>(() => {
    if (wallet.status === "restoring") return { status: "loading" };
    // No guest (NO-GUEST): until the account is in (read, or made on a new device), the profile loads.
    if (!address) return { status: "loading" };
    // The name set on chain, else the indexer's, else the wallet's (the mock's drawn name, #926): an account made since #920 has
    // none on the indexer.
    return {
      status: "connected",
      data: status.data
        ? { ...status.data, player: { ...status.data.player, name: chainName ?? status.data.player.name ?? wallet.username } }
        : {
            player: { playerId: address, name: chainName ?? wallet.username, created: null },
            stats: { challengeGames: 0, challengeFinished: 0, bestScore: 0, paidGames: 0, settledGames: 0, rewards: "0" },
          },
    };
  }, [wallet.status, wallet.username, address, status.data, chainName]);
  const shown = progress.isPending ? undefined : (progress.data ?? undefined);
  // The editor is a drawer of its own (AVATAR-PAGE), its Back to the profile (`reopen`, `useBackToProfile`).
  const onEditAvatar = useCallback(() => go("/avatar"), [go]);
  const onOpenLeague = useCallback(() => go("/pvp/league"), [go]);
  // The profile's Tiles and Invite (PROFILE-DRAWER): the player's tiles and the referral, Settings' sheets.
  const onOpenTiles = useCallback(() => go("/tiles"), [go]);
  const onOpenInvite = useCallback(() => go("/referral"), [go]);
  const value = useMemo(
    () => ({ state, progress: shown, look, onCopy: copy, onEditAvatar, onOpenLeague, onOpenTiles, onOpenInvite, opening, reopen }),
    [state, shown, look, onEditAvatar, onOpenLeague, onOpenTiles, onOpenInvite, opening, reopen],
  );
  return <ProfileProvider value={value}>{children}</ProfileProvider>;
}
