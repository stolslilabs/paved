import { createContext, lazy, Suspense, useCallback, useContext, useRef, useState, type ReactNode, type RefObject } from "react";
import { formatPoints } from "../elements/score";
import { shortAddress } from "../elements/short-address";
import type { ProfileSheetProps, ProfileState } from "./profile-sheet";

/** What the shell hands the menu screens' headers: who is connected and what the sheet's actions do. Absent (stories, tests): no avatar is drawn. */
export type ProfileValue = Omit<ProfileSheetProps, "open" | "onOpenChange" | "returnFocus"> & {
  /**
   * AVATAR-PAGE: the profile asked open again, counted (a page it opened went Back to it: the avatar editor). Each new count opens the
   * sheet; 0 or omitted, none asked.
   */
  opening?: number;
  /** AVATAR-PAGE: asks the profile open again once the village is shown (the avatar editor's Back, before its drawer closes). */
  reopen?: () => void;
};

/** The shell's profile, or null (stories, tests, the boards): also what `/player/:id` opens for the connected player's own ID (#952). */
export const ProfileContext = createContext<ProfileValue | null>(null);
export const ProfileProvider = ProfileContext.Provider;

/** The Back of a page the profile opened (AVATAR-PAGE: the avatar editor): asks the profile open again; null outside the shell. */
export const useBackToProfile = (): (() => void) | null => useContext(ProfileContext)?.reopen ?? null;

/** The profile sheet in its own chunk (#624): fetched on the first tap (or when the pointer comes near), not with the page. */
const loadSheet = () => import("./profile-sheet");
const ProfileSheet = lazy(() => loadSheet().then((m) => ({ default: m.ProfileSheet })));

/** Who the avatar draws: the connected player, else null (the loading placeholder while the account is read). */
export const avatarPlayer = (state: ProfileState) => (state.status === "connected" ? { name: state.data.player.name, address: state.data.player.playerId } : null);

/** The name a header shows: the player's, their short address without one, or nothing while the account is read. */
export const profileName = (state: ProfileState) => (state.status === "connected" ? (state.data.player.name ?? shortAddress(state.data.player.playerId)) : "");

/** The avatar's accessible name: "Profile: bal7hazar, level 3". */
export const profileLabel = (state: ProfileState, progress: ProfileValue["progress"]) =>
  state.status === "connected"
    ? `Profile: ${state.data.player.name ?? shortAddress(state.data.player.playerId)}${progress ? `, level ${formatPoints(progress.level)}` : ""}`
    : "Profile";

/** The avatar's control and the sheet it opens: the home's `PlayerBadge` (#787) is drawn on it. */
export interface ProfileOpener {
  /** The shell's profile; null (stories, tests without it): nothing is drawn. */
  value: ProfileValue | null;
  /** Spread on the button that opens the sheet: its ref, the sheet's chunk fetched as the pointer nears, the tap. */
  trigger: {
    ref: RefObject<HTMLButtonElement | null>;
    type: "button";
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
  const returnFocus = useCallback(() => opener.current, []);
  // Asked open again (a page the profile opened went Back to it): each new count opens it.
  const asked = value?.opening ?? 0;
  const [answered, setAnswered] = useState(asked);
  if (asked !== answered) {
    setAnswered(asked);
    if (asked > 0) {
      setOpened(true);
      setOpen(true);
    }
  }
  // The focus back on the avatar as the sheet closes (the trap lets go at once; the panel leaves after its slide).
  const change = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) requestAnimationFrame(() => opener.current?.focus());
  }, []);
  const trigger: ProfileOpener["trigger"] = {
    ref: opener,
    type: "button",
    "aria-haspopup": "dialog",
    onPointerEnter: () => void loadSheet(),
    onFocus: () => void loadSheet(),
    onClick: () => {
      setOpened(true);
      setOpen(true);
    },
  };
  // An action that leaves the sheet for another screen closes it first (no focus back on the avatar: the screen changes).
  const closing = (action?: () => void) =>
    action &&
    (() => {
      setOpen(false);
      action();
    });
  const sheet = value && opened && (
    <Suspense fallback={null}>
      <ProfileSheet
        {...value}
        open={open}
        onOpenChange={change}
        returnFocus={returnFocus}
        onEditAvatar={closing(value.onEditAvatar)}
        onOpenLeague={closing(value.onOpenLeague)}
        onOpenTiles={closing(value.onOpenTiles)}
        onOpenInvite={closing(value.onOpenInvite)}
      />
    </Suspense>
  );
  return { value, trigger, sheet };
}
