import { lazy, Suspense, useCallback, useState } from "react";
import { cn } from "../../lib/utils";
import { PlayerAvatar } from "../elements/player-avatar";
import { BADGE_ART, badgeArtSources, badgeArtUrl, levelBar, PLATE_HEIGHT, PORTRAIT, SHIELD_RISE, SHIELD_WIDTH } from "../elements/badge-art";
import { DEFAULT_BOX, levelLabel } from "../elements/xp-level";
import { avatarPlayer, profileLabel, profileName, useProfileOpener } from "./profile-context";

/**
 * The bar, the level and their motion in their own chunk, as the ring's were (#625): meanwhile the groove is empty and the shield
 * blank, the badge's art and size being this file's (FIRST-LOAD).
 */
const LevelRing = lazy(() => import("../elements/level-ring").then((m) => ({ default: m.LevelRing })));

/** The ring's width in px, watched: the season dial's size at each width (issue 856), which the badge is drawn on. */
function useWidth() {
  const [width, setWidth] = useState(0);
  // A callback ref (with React 19's cleanup): the ring comes and goes with the shell's profile.
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

/** The display font's mean advance, in ems a character (Almendra Bold, measured on names): what sizes the name before layout. */
const CHAR_EMS = 0.5;
/**
 * The width the name grows the plate to before it shrinks, as a share of the ring's: a name of 15 characters at 13 px beside the
 * 96 px ring, so the badge holds it beside the balances at 375 px.
 */
export const NAME_ROOM = 1.05;
/** The room each side of the name, from the ring's right edge and to the cap, as a share of the ring's width. */
const NAME_GAP = 0.04;

/**
 * The name's size in px: its own (16, 20 beside the 144 px ring) while the plate, grown to the name, stays within `NAME_ROOM`;
 * else smaller, never under 12 px (P-69). Past that (a narrow screen beside wide balances) it ends with an ellipsis.
 */
export function nameSize(name: string, box: number): number {
  const own = box >= 144 ? 20 : 16;
  const fit = (NAME_ROOM * box) / (CHAR_EMS * [...name].length);
  return Math.max(12, Math.min(own, Math.floor(fit)));
}

/**
 * The badge's measures in px for a ring `box` px wide: the shield's rise above the ring (the badge's top), the plate's height
 * and top (centred on the ring), the cap's width, the shield's width.
 */
export function badgeLayout(box: number) {
  const rise = Math.round(SHIELD_RISE * box);
  const plate = Math.round(PLATE_HEIGHT * box);
  return {
    rise,
    plate,
    plateTop: rise + Math.round((box - plate) / 2),
    cap: Math.round((plate * BADGE_ART["plate-cap"].width) / BADGE_ART["plate-cap"].height),
    tile: Math.round((plate * BADGE_ART["plate-tile"].width) / BADGE_ART["plate-tile"].height),
    shield: Math.round(SHIELD_WIDTH * box),
  };
}

export interface PlayerBadgeProps {
  className?: string;
}

/**
 * The profile at the home's top left (#787, redrawn after the owner's direction of 2026-10-31, `docs/design/player-badge.webp`):
 * the avatar in a ring of paving stones set with gold, the season dial's size (#856), living (its idle, its head following the
 * cursor on a desktop, AVATAR-LIVING); in the ring's groove the level's luminous bar,
 * a whole turn clockwise from 12 o'clock, under the gold shield that holds the level, back to it; at the ring's right the name plate, its
 * bricks repeated to the name's length (a name has at most 15 characters, `PLAYER_NAME_MAX`) and ended by a gold arrow cap. The
 * name grows the plate up to `NAME_ROOM`, then shrinks, then is cut with an ellipsis where the home's room ends (`--profile-room`,
 * set by the home beside its balances). A tap anywhere on it opens the profile sheet (#624), which has the XP made and left. The
 * gains and level ups are `LevelRing`'s. Without the shell's profile (some stories and tests), nothing.
 */
export function PlayerBadge({ className }: PlayerBadgeProps) {
  const { value, trigger, sheet } = useProfileOpener();
  const [ringRef, measured] = useWidth();
  // Not laid out (the render tests): the phone's ring.
  const box = measured || DEFAULT_BOX;
  if (!value) return null;
  const connected = value.state.status === "connected";
  const progress = connected ? value.progress : undefined;
  const name = profileName(value.state);
  const layout = badgeLayout(box);
  return (
    <div data-slot="player-badge" className={cn("flex flex-col items-start", className)}>
      <button
        {...trigger}
        aria-label={`${profileLabel(value.state, undefined)}${progress ? `, ${levelLabel(progress)}` : ""}`}
        className="relative flex max-w-[var(--profile-room,100%)] shrink-0 cursor-pointer items-start rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        // The ring's box and the shield above it; the plate in the flow from the ring's middle, so the badge is as wide as the name,
        // within the home's room (`--profile-room`; elsewhere, the width it is given).
        style={{ height: layout.rise + box, paddingLeft: box / 2 }}
      >
        {/*
          The plate, under the ring from its middle: the tile repeated from the cap leftward (its last bricks under the ring), the name
          on its face from the ring's right edge, then the cap.
        */}
        {name && (
          <span data-slot="name-plate" aria-hidden className="relative flex min-w-0" style={{ height: layout.plate, marginTop: layout.plateTop }}>
            <span
              data-slot="name-face"
              className="flex min-w-0 items-center bg-right bg-repeat-x"
              style={{
                paddingLeft: box / 2 + Math.round(NAME_GAP * box),
                paddingRight: Math.round(NAME_GAP * box),
                backgroundImage: `url(${badgeArtUrl("plate-tile", BADGE_ART["plate-tile"].sizes[0])})`,
                backgroundSize: `${layout.tile}px 100%`,
              }}
            >
              <span title={name} className="text-outline min-w-0 truncate font-display leading-tight text-foreground" style={{ fontSize: nameSize(name, box) }}>
                {name}
              </span>
            </span>
            <img data-slot="name-cap" src={badgeArtUrl("plate-cap", BADGE_ART["plate-cap"].sizes[0])} alt="" width={layout.cap} height={layout.plate} draggable={false} className="block shrink-0" />
          </span>
        )}
        {/* The ring at the season dial's size (#856, `DIAL_SIZE`: 96, 108 from 390 px wide, 144 from `tablet`), the shield rising above it. */}
        <span ref={ringRef} data-slot="avatar-ring" className="absolute left-0 size-24 min-[24.375rem]:size-27 tablet:size-36" style={{ top: layout.rise }}>
          <span className="absolute" style={{ inset: ((1 - PORTRAIT) / 2) * box }}>
            <PlayerAvatar size="lg" live className="size-full p-0" player={avatarPlayer(value.state)} loading={value.state.status === "loading"} look={value.look} />
          </span>
          <img data-slot="ring" {...badgeArtSources("ring", box)} alt="" draggable={false} className="absolute inset-0 block size-full" />
          {connected && (
            <>
              <img
                data-slot="shield"
                {...badgeArtSources("shield", layout.shield)}
                alt=""
                width={layout.shield}
                draggable={false}
                className="absolute block"
                // Over the bar, whose end it hides; the level over it (`LevelRing`).
                style={{ left: (box - layout.shield) / 2, top: -layout.rise, zIndex: 1 }}
              />
              <Suspense fallback={null}>
                <LevelRing progress={progress} box={box} bar={levelBar(box)} />
              </Suspense>
            </>
          )}
        </span>
      </button>
      {sheet}
    </div>
  );
}
