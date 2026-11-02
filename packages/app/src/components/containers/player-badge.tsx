import { lazy, Suspense, type CSSProperties } from "react";
import { cn } from "../../lib/utils";
import { PlayerAvatar } from "../elements/player-avatar";
import { CARD_FRAME_SLICE, uiFrameImageSet } from "../elements/ui-art";
import { levelLabel } from "../elements/xp-level";
import { avatarPlayer, profileLabel, profileName, useProfileOpener } from "./profile-context";

/**
 * The rim of the player's league and its crest: the League control's chunk, which the home loads at once (FIRST-LOAD); meanwhile
 * the portrait stands in a plain ring of the same box.
 */
const LazyPlayerRim = lazy(() => import("./league-control").then((m) => ({ default: m.PlayerRim })));
/** The level's star and bar and their motion in their own chunk, as the ring's were (#625): meanwhile an empty box of their size. */
const LazyLevelBar = lazy(() => import("../elements/level-bar").then((m) => ({ default: m.LevelBar })));

/** The portrait's inset in the rim's square: the rim's hole (`RIM_PORTRAIT`), so nothing moves when the rim comes. */
const PORTRAIT_INSET = "inset-[15%]";

/** The frame's corners drawn 13 px (its 9-slice): the rim about 5.5 px, the corner's curve about 10.5 px, as on the mockup. */
const FRAME_PX = 13;
/** The card's frame (`card-frame`, the mockup's outline and slate rim, painted irregular), its centre clear. */
const FRAME: CSSProperties = {
  borderStyle: "solid",
  borderColor: "transparent",
  borderWidth: FRAME_PX,
  borderImageSource: uiFrameImageSet("card-frame"),
  borderImageSlice: `${(CARD_FRAME_SLICE.y * 100).toFixed(2)}% ${(CARD_FRAME_SLICE.x * 100).toFixed(2)}%`,
  borderImageWidth: `${FRAME_PX}px`,
  borderImageRepeat: "stretch",
};

export interface PlayerBadgeProps {
  /** The player's crowns and attacks settled this season (the home's read): the rim's league. Left out: Wood, 0 crowns. */
  league?: { crowns: number; attacks?: number } | null;
  className?: string;
}

/**
 * The player card at the home's top left (#787, redrawn after the owner's direction of 2026-11-01, `docs/design/home.webp`, decomposed
 * layer by layer): a see-through dark grey face in the mockup's frame (`card-frame`: a near-black outline and a slate rim, painted
 * irregular, a 9-slice), a crisp black drop shadow following the frame; the avatar in the rim of the player's league with the
 * league's crest at its lower left, both running past the card's foot; then the name and, under it, the level's star over the XP's
 * blue bar ("90/150"). The card grows with the name (a name has at most 15 characters, `PLAYER_NAME_MAX`) and ends it with an
 * ellipsis where the home's room ends (`--profile-room`, set by the home beside its balances). A tap anywhere on it opens the profile
 * sheet (#624), which has the XP made and left. The gains and level ups are `LevelBar`'s. Without the shell's profile (some stories
 * and tests), nothing.
 */
export function PlayerBadge({ league, className }: PlayerBadgeProps) {
  const { value, trigger, sheet } = useProfileOpener();
  if (!value) return null;
  const connected = value.state.status === "connected";
  const progress = connected ? value.progress : undefined;
  const name = profileName(value.state);
  // The default avatar's initial at 30 px, not the large avatar's 36: Almendra's line (1.29 em, 46 px at 36) passes the rim's 44 px
  // disc and is cut by it; at 30 px it is 39 px, clear inside the disc and the stand-in ring's 42.
  const portrait = (
    <PlayerAvatar
      size="lg"
      live
      className="size-full p-0 [&>span]:text-3xl"
      player={avatarPlayer(value.state)}
      loading={value.state.status === "loading"}
      look={value.look}
    />
  );
  return (
    <div data-slot="player-badge" className={cn("flex", className)}>
      <button
        {...trigger}
        aria-label={`${profileLabel(value.state, undefined)}${progress ? `, ${levelLabel(progress)}` : ""}`}
        data-slot="player-card"
        className="state-layer relative isolate flex max-w-[var(--profile-room,100%)] min-w-0 cursor-pointer items-center gap-1.5 rounded-2xl py-1.5 pr-2.5 pl-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring tablet:gap-2 tablet:pr-3"
      >
        {/* The face, see-through dark grey, under the frame's rim; then the frame, its black drop shadow following its painted edge. */}
        <span aria-hidden data-slot="card-face" className="absolute inset-[3px] -z-10 rounded-[11px] bg-hud-card/80 shadow-[inset_0_1px_2px_var(--background)] backdrop-blur-sm" />
        <span aria-hidden data-slot="card-frame" className="pointer-events-none absolute inset-0 -z-10 [filter:drop-shadow(0_1.5px_0_var(--background))_drop-shadow(0_3px_5px_var(--background))]" style={FRAME} />
        {/*
          The avatar in its rim, 64 px, 72 from `tablet` (the rim's square takes the box's font size; the default avatar's initial needs
          that much), about the card's height: from near its top it runs a little past the card's foot, the crest further (its negative
          margins keep the card the height of the name and the bar).
        */}
        <span data-slot="avatar-rim" className="relative -mt-0.5 -mb-3 block shrink-0 self-start text-[4rem] tablet:-mb-3.5 tablet:text-[4.5rem]">
          <Suspense
            fallback={
              <span className="relative block size-[1em] rounded-full border-2 border-border">
                <span className={cn("absolute overflow-hidden rounded-full", PORTRAIT_INSET)}>{portrait}</span>
              </span>
            }
          >
            <LazyPlayerRim crowns={league?.crowns} attacks={league?.attacks}>
              {portrait}
            </LazyPlayerRim>
          </Suspense>
        </span>
        <span className="flex min-w-0 flex-col">
          {name && (
            <span data-slot="player-name" title={name} className="text-outline min-w-0 truncate text-base leading-tight font-black text-foreground tablet:text-lg">
              {name}
            </span>
          )}
          {connected && (
            <Suspense fallback={<span aria-hidden className="block h-7 w-36 max-w-full tablet:w-40" />}>
              <LazyLevelBar progress={progress} />
            </Suspense>
          )}
        </span>
      </button>
      {sheet}
    </div>
  );
}
