import { lazy, Suspense, useCallback, useState } from "react";
import { cn } from "../../lib/utils";
import { PlayerAvatar } from "../elements/player-avatar";
import { levelLabel, PATH_BOX, XpPathStill } from "../elements/xp-level";
import { avatarPlayer, profileLabel, profileName, useProfileOpener } from "./profile-context";

/** The path's motion in its own chunk, as the ring's was (#625): its still holds the same box meanwhile (FIRST-LOAD). */
const XpPath = lazy(() => import("../elements/xp-path").then((m) => ({ default: m.XpPath })));

/**
 * A box's width in px, watched: the name column's, which the line runs over (it narrows when the balances beside it are wide, the
 * home's `--balances-w`), and the avatar's, which the arc goes round (the season dial's size at each width, #856).
 */
function useWidth() {
  const [width, setWidth] = useState(0);
  // A callback ref (with React 19's cleanup): the column comes and goes with the shell's profile.
  const ref = useCallback((el: HTMLSpanElement | null) => {
    if (!el) return;
    const measure = () => setWidth(el.offsetWidth);
    measure();
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    resize?.observe(el);
    return () => resize?.disconnect();
  }, []);
  return [ref, width] as const;
}

export interface PlayerBadgeProps {
  className?: string;
}

/**
 * The profile at the home's top left (#787, reshaped by #830): the avatar, the season dial's size (#856), with the level's path round it, an arc from its right
 * clockwise to its top that runs on as a line to the right, "Lv i" at the line's end, and the name under the line in the display
 * font. A tap anywhere on it opens the profile sheet (#624), which has the XP made and left. The gains and level ups are
 * `XpPath`'s. The league, its crowns and its border left it for the League control under it (#829). Without the shell's profile
 * (some stories and tests), nothing.
 */
export function PlayerBadge({ className }: PlayerBadgeProps) {
  const { value, trigger, sheet } = useProfileOpener();
  const [columnRef, column] = useWidth();
  const [avatarRef, measured] = useWidth();
  // Not laid out (the render tests): the path's own box. The column in the path's units.
  const box = measured || PATH_BOX;
  const units = (column * PATH_BOX) / box;
  if (!value) return null;
  const connected = value.state.status === "connected";
  const progress = connected ? value.progress : undefined;
  const name = profileName(value.state);
  return (
    <div data-slot="player-badge" className={cn("flex flex-col items-start", className)}>
      <button
        {...trigger}
        aria-label={`${profileLabel(value.state, undefined)}${progress ? `, ${levelLabel(progress)}` : ""}`}
        className="relative flex cursor-pointer items-start rounded-xl pt-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* The avatar at the season dial's size (#856, `DIAL_SIZE`: 96, 108 from 390 px wide, 144 from `tablet`), the arc round it. */}
        <span ref={avatarRef} className="shrink-0">
          <PlayerAvatar size="lg" className="p-1.5 min-[24.375rem]:size-27 tablet:size-36" player={avatarPlayer(value.state)} loading={value.state.status === "loading"} look={value.look} />
        </span>
        {/*
          The name column: the line runs over it, the name sits under the line (#830), both scaled with the avatar (#856). The name
          may run on under "Lv i" (2.5 rem, the plate's narrowest), which stands on the line above it: the larger avatar leaves the
          column less room beside the balances.
        */}
        <span ref={columnRef} className="flex w-28 min-w-0 shrink items-start pt-3 pl-1.5 mobile:w-32 tablet:w-40">
          <span
            aria-hidden
            title={name}
            className="max-w-[calc(100%+2.5rem)] shrink-0 truncate rounded-md bg-background/60 px-1.5 font-display text-base leading-5 backdrop-blur tablet:text-xl tablet:leading-7"
          >
            {name}
          </span>
        </span>
        {connected && (
          <Suspense fallback={<XpPathStill progress={progress} column={units} box={box} />}>
            <XpPath progress={progress} column={units} box={box} />
          </Suspense>
        )}
      </button>
      {sheet}
    </div>
  );
}
