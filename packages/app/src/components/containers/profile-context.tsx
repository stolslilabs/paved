import { createContext, lazy, Suspense, useCallback, useContext, useRef, useState, type ReactNode, type RefObject } from "react";
import { cn } from "../../lib/utils";
import { PlayerAvatar } from "../elements/player-avatar";
import { formatPoints } from "../elements/score";
import { shortAddress } from "../elements/short-address";
import type { ProfileSheetProps, ProfileState } from "./profile-sheet";

/** What the shell hands the menu screens' headers: who is connected and what the sheet's actions do. Absent (stories, tests): no avatar is drawn. */
export type ProfileValue = Omit<ProfileSheetProps, "open" | "onOpenChange" | "returnFocus">;

/** The shell's profile, or null (stories, tests, the boards): also what `/player/:id` opens for the connected player's own ID (#952). */
export const ProfileContext = createContext<ProfileValue | null>(null);
export const ProfileProvider = ProfileContext.Provider;

/** The profile sheet in its own chunk (#624): fetched on the first tap (or when the pointer comes near), not with the page. */
const loadSheet = () => import("./profile-sheet");
const ProfileSheet = lazy(() => loadSheet().then((m) => ({ default: m.ProfileSheet })));
/** The XP ring and level badge (#625) in their own chunk too, drawn once loaded (the avatar shows without them first). */
const XpRing = lazy(() => import("../elements/xp-ring").then((m) => ({ default: m.XpRing })));

/**
 * The avatar to give the focus back to: the one that opened the sheet while it is shown, else the one shown now. The page
 * header's and the navigation's swap at `desktop`, so a resize while the sheet is open hides the opener (#624).
 */
function shownAvatar(opener: HTMLElement | null): HTMLElement | null {
  const shown = (el: HTMLElement) => el.getClientRects().length > 0;
  if (!opener || shown(opener)) return opener;
  return [...document.querySelectorAll<HTMLElement>("[data-slot=profile-avatar]")].find(shown) ?? opener;
}

/** Who the avatar draws: the connected player, else null (a guest's silhouette, or the loading placeholder). */
export const avatarPlayer = (state: ProfileState) => (state.status === "connected" ? { name: state.data.player.name, address: state.data.player.playerId } : null);

/** The name a header shows: the player's, their short address without one, "Guest", or nothing while the wallet looks. */
export const profileName = (state: ProfileState) =>
  state.status === "connected" ? (state.data.player.name ?? shortAddress(state.data.player.playerId)) : state.status === "guest" ? "Guest" : "";

/** The avatar's accessible name: "Profile: bal7hazar, level 3". */
export const profileLabel = (state: ProfileState, progress: ProfileValue["progress"]) =>
  state.status === "connected"
    ? `Profile: ${state.data.player.name ?? shortAddress(state.data.player.playerId)}${progress ? `, level ${formatPoints(progress.level)}` : ""}`
    : state.status === "guest"
      ? "Profile: guest"
      : "Profile";

/** The avatar's control and the sheet it opens: what `ProfileSlot` and the home's `PlayerBadge` (#787) share. */
export interface ProfileOpener {
  /** The shell's profile; null (stories, tests without it): nothing is drawn. */
  value: ProfileValue | null;
  /** Spread on the button that opens the sheet: its ref, its slot, the sheet's chunk fetched as the pointer nears, the tap. */
  trigger: {
    ref: RefObject<HTMLButtonElement | null>;
    type: "button";
    "data-slot": "profile-avatar";
    "aria-haspopup": "dialog";
    onPointerEnter: () => void;
    onFocus: () => void;
    onClick: () => void;
  };
  /** The sheet, once first opened (render it beside the button). */
  sheet: ReactNode;
}

/** The profile sheet behind a button of the caller's (#624): the focus back on that button as it closes. */
export function useProfileOpener(): ProfileOpener {
  const value = useContext(ProfileContext);
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const returnFocus = useCallback(() => shownAvatar(opener.current), []);
  // The focus back on the avatar as the sheet closes (the trap lets go at once; the panel leaves after its slide).
  const change = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) requestAnimationFrame(() => shownAvatar(opener.current)?.focus());
  }, []);
  const trigger: ProfileOpener["trigger"] = {
    ref: opener,
    type: "button",
    "data-slot": "profile-avatar",
    "aria-haspopup": "dialog",
    onPointerEnter: () => void loadSheet(),
    onFocus: () => void loadSheet(),
    onClick: () => {
      setOpened(true);
      setOpen(true);
    },
  };
  const sheet = value && opened && (
    <Suspense fallback={null}>
      <ProfileSheet
        {...value}
        open={open}
        onOpenChange={change}
        returnFocus={returnFocus}
        onDisconnect={() => {
          change(false);
          value.onDisconnect?.();
        }}
        onEditAvatar={
          value.onEditAvatar &&
          (() => {
            setOpen(false);
            value.onEditAvatar?.();
          })
        }
        onOpenLeague={
          value.onOpenLeague &&
          (() => {
            setOpen(false);
            value.onOpenLeague?.();
          })
        }
      />
    </Suspense>
  );
  return { value, trigger, sheet };
}

/**
 * The player's avatar alone, in its XP ring (#624, #625); a tap opens the profile sheet. The home's top left is `PlayerBadge`'s
 * (#787, #830), which adds the name and the level's arc and line.
 */
export function ProfileSlot({ className }: { className?: string }) {
  const { value, trigger, sheet } = useProfileOpener();
  if (!value) return null;
  const { state, progress, look } = value;
  return (
    <>
      <button {...trigger} aria-label={profileLabel(state, progress)} className={cn("state-layer shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
        <PlayerAvatar player={avatarPlayer(state)} loading={state.status === "loading"} look={look}>
          {state.status === "connected" && (
            <Suspense fallback={null}>
              <XpRing progress={progress} />
            </Suspense>
          )}
        </PlayerAvatar>
      </button>
      {sheet}
    </>
  );
}
