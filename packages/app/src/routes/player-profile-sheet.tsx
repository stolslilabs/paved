import { useContext } from "react";
import { parsePlayerId } from "@paved/game-core";
import { ProfileSheet } from "../components/containers/profile-sheet";
import { ProfileContext } from "../components/containers/profile-context";
import { PublicProfileSheet, type PublicProfileState } from "../components/containers/public-profile-sheet";
import { addressKey } from "../data/keys";
import { usePlayerProgress } from "../data/player-progress";
import { useFollowStatus, usePublicProfile } from "../data/social";
import { useDataSources } from "../data/sources";
import { useAccount } from "../wallet/wallet";
import { errorDetail } from "./error-detail";
import { useNow } from "./now";
import { ProfileFollowActions } from "./profile-follow";
import { ProfileGuildActions, ProfileGuildLine } from "./profile-guild";
import { ProfileMessageAction } from "./profile-message";

// The public profile's chunk (#952): the sheet and its read, fetched at the first opening (`page-views-host.tsx`).

/** The clipboard, or a failed copy without it (an insecure origin, an old browser). */
const copy = (text: string) => (navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error("No Clipboard API")));

/** The same player ID, in any form; false for what is not one. */
function samePlayer(a: string | null, b: string): boolean {
  if (a === null) return false;
  try {
    return addressKey(a) === addressKey(b);
  } catch {
    return false;
  }
}

/**
 * The profile of `playerId`, read from the social source: another player's public profile, or, for the connected player's own
 * ID, their own profile sheet, as their avatar opens it.
 */
export default function PlayerProfile({ playerId, open, onClose }: { playerId: string; open: boolean; onClose: () => void }) {
  const wallet = useAccount();
  const own = useContext(ProfileContext);
  const me = useDataSources().signer?.address ?? wallet.address ?? null;
  const self = own !== null && samePlayer(wallet.address, playerId);
  // While the wallet looks for an earlier session the ID may be the player's own: nothing is read until it knows.
  const restoring = wallet.status === "restoring";
  const read = usePublicProfile(self || restoring ? null : playerId);
  const now = useNow();
  // The follows (#954): the marks, the counts and the actions, from one read.
  const follow = useFollowStatus(self || restoring ? null : me, self || restoring ? null : playerId);
  // FRIENDS-PAGE: their level and XP for the Profile's bar, `Setup.player_level` as the player's own profile reads theirs.
  // PLAYER-LINK-CRASH (#1026): the canonical ID, or null for what is not one (a typed `/player/:id`), so that the level's read stays
  // idle (its key normalises the ID with `BigInt`, which throws on it) and the sheet says "Player not found", as its profile read does.
  const id = parsePlayerId(playerId);
  const progress = usePlayerProgress(self || restoring ? null : id);
  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };
  if (self) return <ProfileSheet {...own} open={open} onOpenChange={onOpenChange} inPlace />;
  const state: PublicProfileState = restoring
    ? { status: "loading" }
    : read.unavailable
    ? { status: "unavailable" }
    : read.error
      ? { status: "error", message: read.error.message }
      : read.data === undefined
        ? { status: "loading" }
        : read.data === null
          ? { status: "missing" }
          : { status: "ready", profile: read.data };
  return (
    <PublicProfileSheet
      state={state}
      now={now}
      open={open}
      onOpenChange={onOpenChange}
      onCopy={copy}
      onRetry={read.refetch}
      errorDetail={read.error ? errorDetail(read.error) : undefined}
      guild={state.status === "ready" && <ProfileGuildLine address={state.profile.address} />}
      follow={state.status === "ready" ? follow.data : undefined}
      progress={progress.data}
      actions={
        state.status === "ready" && (
          <>
            <ProfileMessageAction address={state.profile.address} name={state.profile.name} me={me} status={follow.data} />
            <ProfileFollowActions address={state.profile.address} name={state.profile.name} me={me} status={follow.data} />
            {/* FRIENDS-PAGE: the guild's actions on a line of their own, under the Profile's tiles. */}
            <div className="basis-full empty:hidden">
              <ProfileGuildActions address={state.profile.address} name={state.profile.name} me={me} now={now} />
            </div>
          </>
        )
      }
    />
  );
}
