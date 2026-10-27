import { lazy, Suspense } from "react";
import { cn } from "../../lib/utils";
import { PlayerAvatar } from "../elements/player-avatar";
import { levelLabel, XpBarStill } from "../elements/xp-level";
import { avatarPlayer, profileLabel, profileName, useProfileOpener } from "./profile-context";

/** The bar's motion in its own chunk, as the ring's was (#625): its still holds the same box meanwhile (FIRST-LOAD). */
const XpBar = lazy(() => import("../elements/xp-bar").then((m) => ({ default: m.XpBar })));

export interface PlayerBadgeProps {
  className?: string;
}

/**
 * The profile at the home's top left (#787): the avatar, beside it the name and the XP bar (the level, the XP left); a tap opens
 * the profile sheet (#624). The bar's gains and level ups are `XpBar`'s. The league, its crowns and its border left it for the
 * League control under it (#829). Without the shell's profile (some stories and tests), nothing.
 */
export function PlayerBadge({ className }: PlayerBadgeProps) {
  const { value, trigger, sheet } = useProfileOpener();
  if (!value) return null;
  const connected = value.state.status === "connected";
  const progress = connected ? value.progress : undefined;
  return (
    <div data-slot="player-badge" className={cn("flex flex-col items-start gap-1", className)}>
      <button
        {...trigger}
        aria-label={`${profileLabel(value.state, undefined)}${progress ? `, ${levelLabel(progress)}` : ""}`}
        className="state-layer flex cursor-pointer items-center gap-2 rounded-full bg-background/70 py-0.5 pr-3 pl-0.5 text-left backdrop-blur outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PlayerAvatar player={avatarPlayer(value.state)} loading={value.state.status === "loading"} look={value.look} />
        <span className="flex w-28 min-w-0 flex-col gap-0.5 mobile:w-32 tablet:w-40">
          <span aria-hidden title={profileName(value.state)} className="truncate text-sm leading-5 font-semibold">
            {profileName(value.state)}
          </span>
          {connected && (
            <Suspense fallback={<XpBarStill progress={progress} />}>
              <XpBar progress={progress} />
            </Suspense>
          )}
        </span>
      </button>
      {sheet}
    </div>
  );
}
