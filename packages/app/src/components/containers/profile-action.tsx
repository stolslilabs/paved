import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { isFriendsArt, type FriendsArtName } from "../elements/friends-art";
import { FriendsArt } from "../elements/friends-art-image";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";

export interface ActionTileProps {
  /** A HUD icon, or one of the friends page's (`friends-art.ts`: the followers, Block), from its own chunk. */
  art: UiIconName | FriendsArtName;
  label: string;
  /** The accessible name, when it says more than the label ("Edit avatar", "Message Wren"). */
  name?: string;
  onClick: () => void;
  disabled?: boolean;
  /** Busy: `aria-busy`, and no second press. */
  loading?: boolean;
  /** Drawn over the icon (Invite's USDC). */
  children?: ReactNode;
  className?: string;
}

/**
 * One of a profile's actions (PROFILE-PAGE; FRIENDS-PAGE: another player's profile has its own, Message, Following, Block): its icon over
 * its name, on a raised tile, the tiles sharing their row. Its own file, so the follow actions and Message take it without the profile.
 */
export function ActionTile({ art, label, name, onClick, disabled, loading, children, className }: ActionTileProps) {
  return (
    <button
      type="button"
      data-slot="profile-action"
      aria-label={name}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        "state-layer drawer-tile flex min-w-0 flex-1 basis-0 cursor-pointer flex-col items-center gap-1 rounded-2xl px-0.5 pt-2.5 pb-2 outline-none disabled:cursor-default disabled:opacity-60",
        className,
      )}
    >
      <span className="relative">
        {isFriendsArt(art) ? <FriendsArt part={art} px={44} className="drawer-icon size-11" /> : <UiIcon name={art} px={44} className="drawer-icon size-11" />}
        {children}
      </span>
      {/* 12 px, tight: each name holds on one line in a 360 px phone's quarter; narrower, it wraps between its words. */}
      <span className="text-outline max-w-full text-center text-xs leading-tight font-bold tracking-tight">{label}</span>
    </button>
  );
}
