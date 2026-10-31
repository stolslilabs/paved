import { lazy, Suspense, useCallback, useState } from "react";
import { cn } from "../../lib/utils";
import { PlayerAvatar } from "../elements/player-avatar";
import { GameIcon } from "../elements/game-icon";
import { badgeWidth, DEFAULT_BOX, levelLabel, nameCorner } from "../elements/xp-level";
import { avatarPlayer, profileLabel, profileName, useProfileOpener } from "./profile-context";

/**
 * The path, its drawing and its motion in their own chunk, as the ring's were (#625): nothing stands in meanwhile, the badge's width
 * being its classes' (FIRST-LOAD; the bar and the tag come with the chunk).
 */
const XpPath = lazy(() => import("../elements/xp-path").then((m) => ({ default: m.XpPath })));

/** The avatar's width in px, watched: the season dial's size at each width (issue 856), which the path goes round. */
function useWidth() {
  const [width, setWidth] = useState(0);
  // A callback ref (with React 19's cleanup): the avatar comes and goes with the shell's profile.
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

/** The name's room in ems beside its text: the User icon (Font Awesome's fixed width, 1.25 em) and the gap after it. */
const ICON_EMS = 1.5;
/** The display font's mean advance, in ems a character (Almendra Bold, measured on names): what sizes the name before layout. */
const CHAR_EMS = 0.5;
/** The name's row's inner padding, each side, in px (`px-0.5`). */
const NAME_PAD = 2;

/**
 * The name's size in px (issue 928's open point 3): its own (16, 20 beside the 144 px avatar) when the icon and the name fit in
 * its corner, from the bar's wrapping end to the badge's end, else smaller, never under 12 px (P-69); past that it ends with an ellipsis.
 */
export function nameSize(name: string, box: number): number {
  const own = box >= 144 ? 20 : 16;
  const room = badgeWidth(box) - nameCorner(box).left - 2 * NAME_PAD;
  const fit = room / (ICON_EMS + CHAR_EMS * [...name].length);
  return Math.max(12, Math.min(own, Math.floor(fit)));
}

export interface PlayerBadgeProps {
  className?: string;
}

/**
 * The profile at the home's top left (#787, reshaped by #830 and #928): the avatar, the season dial's size (#856), with the level's
 * path round it, an opaque bar from its right clockwise to its top that runs on as a line to the right and ends square in the
 * level tag, "Lv i", of a fixed width; the whole at most 1.5 times the avatar's width. The bar's start, the end that hugs the
 * avatar, is round. The name, after a User icon, in the corner the bar's wrapping end and its horizontal run leave beside the
 * avatar (the owner on #928, 2026-10-31), on a band that starts behind the avatar and fades out to transparent toward the level,
 * at the badge's end. A tap anywhere on it opens the profile sheet (#624), which has the XP
 * made and left. The gains and level ups are `XpPath`'s. The league, its crowns and its border left it for the League control under
 * it (#829). Without the shell's profile (some stories and tests), nothing.
 */
export function PlayerBadge({ className }: PlayerBadgeProps) {
  const { value, trigger, sheet } = useProfileOpener();
  const [avatarRef, measured] = useWidth();
  // Not laid out (the render tests): the phone's avatar.
  const box = measured || DEFAULT_BOX;
  if (!value) return null;
  const connected = value.state.status === "connected";
  const progress = connected ? value.progress : undefined;
  const name = profileName(value.state);
  const corner = nameCorner(box);
  return (
    <div data-slot="player-badge" className={cn("flex flex-col items-start", className)}>
      <button
        {...trigger}
        aria-label={`${profileLabel(value.state, undefined)}${progress ? `, ${levelLabel(progress)}` : ""}`}
        // 1.5 times the avatar (`badgeWidth`): 144, 162 and 216 px beside its 96, 108 and 144.
        className="relative flex w-36 shrink-0 cursor-pointer items-start rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring min-[24.375rem]:w-[10.125rem] tablet:w-54"
      >
        {/*
          The name's row in its corner (`nameCorner`): under the bar's horizontal run, over its round wrapping end, from that end's
          left edge to the badge's end. The band starts behind the avatar (its middle) and fades out linearly, its blur with it, to
          transparent at the badge's end, under the tag; the name after the User icon, sized to fit, its shadow keeping it legible.
        */}
        <span data-slot="name-row" aria-hidden className="absolute right-0 flex items-center px-0.5 font-display" style={corner}>
          <span
            data-slot="name-band"
            className="absolute inset-y-0 right-0 bg-background/60 backdrop-blur [mask-image:linear-gradient(to_right,black,transparent)]"
            style={{ left: box / 2 - corner.left }}
          />
          <span className="relative flex h-5 min-w-0 items-center gap-[0.25em] leading-none tablet:h-7" style={{ fontSize: nameSize(name, box) }}>
            <GameIcon name="user" size="inherit" />
            <span title={name} className="min-w-0 truncate leading-tight [text-shadow:0_1px_2px_var(--background)]">
              {name}
            </span>
          </span>
        </span>
        {/* The avatar at the season dial's size (#856, `DIAL_SIZE`: 96, 108 from 390 px wide, 144 from `tablet`), the bar round it in its padding. */}
        <span ref={avatarRef} className="relative shrink-0">
          <PlayerAvatar size="lg" className="p-4 min-[24.375rem]:size-27 tablet:size-36 tablet:p-5" player={avatarPlayer(value.state)} loading={value.state.status === "loading"} look={value.look} />
        </span>
        {connected && (
          <Suspense fallback={null}>
            <XpPath progress={progress} box={box} />
          </Suspense>
        )}
      </button>
      {sheet}
    </div>
  );
}
