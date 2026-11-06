import type { ReactNode } from "react";
import { HudDrawer } from "../containers/hud-drawer";
import { SocialEmpty } from "../containers/social-empty";

export interface GuildSceneProps {
  /** The page's content as the app draws it (the finder, or the player's guild, #953). Unset: the empty state, as a guest sees it. */
  children?: ReactNode;
  /** The drawer's close: Back on a phone, the red cross from `tablet`, Escape, a tap on the village. */
  onBack?: () => void;
  /** Whether the drawer is shown (GUILD-PAGE): its route is the current one; false while it slides out. Omitted, shown. */
  open?: boolean;
  /** Where the focus goes back as the drawer closes (the dock's Guild, which opened it); omitted, Radix's own. */
  returnFocus?: () => HTMLElement | null;
}

/** A press outside the drawer that is no tap on the village: on a dialog drawn over it (a profile, another guild, a confirmation). */
function keepForDialogs(event: Event) {
  if (event.target instanceof Element && event.target.closest('[role="dialog"], [role="alertdialog"]')) event.preventDefault();
}

/**
 * The guild page (`/guild`, #973, in place of the Social page's Guild tab), for running the guild. GUILD-PAGE (the Paved UX Book's
 * "Run my guild", the owner's approved mockups): the HUD's drawer, as the Shop, the other page of the dock (`HudDrawer`): a full page
 * with Back on a phone, a side panel docked at the right from `tablet` (the book's tablet and desktop draw a centred window: the Shop's
 * rule of 2026-11-05 docks it at the right), its close the red cross. In it, for a player in no guild the finder; for a member their
 * guild's header, menu and tabs (Announcements, Members, Requests for officers and the leader, Log); the menu, what it opens and a
 * member's row are views in the drawer, its header naming them, Back one view back, the red cross leaving. Another guild opens in a
 * sheet over it (`?guild=`): its header and its members.
 */
export function GuildScene({ children, onBack, open = true, returnFocus }: GuildSceneProps) {
  return (
    <HudDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onBack?.();
      }}
      title="Guild"
      side="right"
      slot="guild"
      returnFocus={returnFocus}
      onInteractOutside={keepForDialogs}
    >
      {children ?? <SocialEmpty page="guild" />}
    </HudDrawer>
  );
}
