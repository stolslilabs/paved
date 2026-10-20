import { createContext, lazy, Suspense, useContext, useState } from "react";
import { cn } from "../../lib/utils";
import { PlayerAvatar } from "../elements/player-avatar";
import { shortAddress } from "../elements/short-address";
import type { ProfileSheetProps, ProfileState } from "./profile-sheet";

/** What the shell hands the menu screens' headers: who is connected and what the sheet's actions do. Absent (stories, tests): no avatar is drawn. */
export type ProfileValue = Omit<ProfileSheetProps, "open" | "onOpenChange">;

const ProfileContext = createContext<ProfileValue | null>(null);
export const ProfileProvider = ProfileContext.Provider;

/** The profile sheet in its own chunk (#624): fetched on the first tap (or when the pointer comes near), not with the page. */
const loadSheet = () => import("./profile-sheet");
const ProfileSheet = lazy(() => loadSheet().then((m) => ({ default: m.ProfileSheet })));

const label = (state: ProfileState) => (state.status === "connected" ? `Profile: ${state.data.player.name ?? shortAddress(state.data.player.playerId)}` : state.status === "guest" ? "Profile: guest" : "Profile");

/**
 * The player's avatar where a menu screen puts it (#624): the top left of the page's header below `desktop`, the left of the
 * navigation's header from it (each hidden at the other size by its `className`). A tap opens the profile sheet.
 */
export function ProfileSlot({ className }: { className?: string }) {
  const value = useContext(ProfileContext);
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  if (!value) return null;
  const { state } = value;
  return (
    <>
      <button
        type="button"
        aria-label={label(state)}
        aria-haspopup="dialog"
        onPointerEnter={() => void loadSheet()}
        onFocus={() => void loadSheet()}
        onClick={() => {
          setOpened(true);
          setOpen(true);
        }}
        className={cn("shrink-0 cursor-pointer rounded-full transition-transform outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 motion-reduce:transition-none", className)}
      >
        <PlayerAvatar player={state.status === "connected" ? { name: state.data.player.name, address: state.data.player.playerId } : null} loading={state.status === "loading"} />
      </button>
      {opened && (
        <Suspense fallback={null}>
          <ProfileSheet
            {...value}
            open={open}
            onOpenChange={setOpen}
            onDisconnect={() => {
              setOpen(false);
              value.onDisconnect?.();
            }}
          />
        </Suspense>
      )}
    </>
  );
}
