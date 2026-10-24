import { createContext, lazy, Suspense, useCallback, useContext, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { PlayerAvatar } from "../elements/player-avatar";
import { formatPoints } from "../elements/score";
import { shortAddress } from "../elements/short-address";
import type { ProfileSheetProps, ProfileState } from "./profile-sheet";

/** What the shell hands the menu screens' headers: who is connected and what the sheet's actions do. Absent (stories, tests): no avatar is drawn. */
export type ProfileValue = Omit<ProfileSheetProps, "open" | "onOpenChange" | "returnFocus">;

const ProfileContext = createContext<ProfileValue | null>(null);
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

const label = (state: ProfileState, progress: ProfileValue["progress"]) =>
  state.status === "connected"
    ? `Profile: ${state.data.player.name ?? shortAddress(state.data.player.playerId)}${progress ? `, level ${formatPoints(progress.level)}` : ""}`
    : state.status === "guest"
      ? "Profile: guest"
      : "Profile";

/**
 * The player's avatar where a menu screen puts it (#624): the top left of the page's header below `desktop`, the left of the
 * navigation's header from it (each hidden at the other size by its `className`). A tap opens the profile sheet.
 */
export function ProfileSlot({ className }: { className?: string }) {
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
  if (!value) return null;
  const { state, progress, look } = value;
  return (
    <>
      <button
        ref={opener}
        type="button"
        data-slot="profile-avatar"
        aria-label={label(state, progress)}
        aria-haspopup="dialog"
        onPointerEnter={() => void loadSheet()}
        onFocus={() => void loadSheet()}
        onClick={() => {
          setOpened(true);
          setOpen(true);
        }}
        className={cn("state-layer shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      >
        <PlayerAvatar player={state.status === "connected" ? { name: state.data.player.name, address: state.data.player.playerId } : null} loading={state.status === "loading"} look={look}>
          {state.status === "connected" && (
            <Suspense fallback={null}>
              <XpRing progress={progress} />
            </Suspense>
          )}
        </PlayerAvatar>
      </button>
      {opened && (
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
            onOpenVillage={
              value.onOpenVillage &&
              (() => {
                setOpen(false);
                value.onOpenVillage?.();
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
      )}
    </>
  );
}
