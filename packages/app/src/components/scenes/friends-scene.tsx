import type { ReactNode } from "react";
import { HudDrawer } from "../containers/hud-drawer";
import { PlayerSearch, type PlayerSearchProps } from "../containers/player-search";

export interface FriendsSceneProps {
  /** The player search (#952), at the top: its results open a player's public profile, each with Follow. */
  search: PlayerSearchProps;
  /** The lists as the app draws them (`FriendsPanel`: the three tabs, the suggestions, the blocked players; the loading or the unavailable note). */
  children: ReactNode;
  /**
   * Whether the drawer is shown (FRIENDS-PAGE): its route is the current one; false while it slides out. Omitted, shown (a story's,
   * a test's).
   */
  open?: boolean;
  /** Back on a phone, the close from `tablet`, Escape, a tap on the village: up to the village (BACK-RULE #783). */
  onBack?: () => void;
  /** Where the focus goes back as the drawer closes (the home's Friends button); omitted, Radix's own. */
  returnFocus?: () => HTMLElement | null;
}

/** A press outside the drawer that is no tap on the village: on a dialog drawn over it (a profile, a confirmation). */
function keepForDialogs(event: Event) {
  if (event.target instanceof Element && event.target.closest('[role="dialog"], [role="alertdialog"]')) event.preventDefault();
}

/**
 * The friends page (`/friends`, #973; FRIENDS-PAGE, the Paved UX Book's "Friends and followers"): the HUD's drawer, as Missions and the
 * Shop (`HudDrawer`): a full page with Back on a phone, a side panel docked at the right from `tablet`, where the home's Friends button
 * is (the book's tablet and desktop centre it, which no drawer does: the right, the brief's default). Under its header the book's
 * carved search, "Find a player by name or ID" (#952), then the three tabs, Friends, Following and Followers, each with its count,
 * the Suggestions and the blocked players (#954). A row opens the player's profile over it.
 */
export function FriendsScene({ search, children, open = true, onBack, returnFocus }: FriendsSceneProps) {
  return (
    <HudDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onBack?.();
      }}
      title="Friends"
      side="right"
      slot="friends"
      returnFocus={returnFocus}
      onInteractOutside={keepForDialogs}
    >
      <div className="flex flex-col gap-4">
        <PlayerSearch look="drawer" {...search} />
        {children}
      </div>
    </HudDrawer>
  );
}
