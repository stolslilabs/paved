import { lazy, Suspense } from "react";
import { cn } from "../../lib/utils";
import { PlayerAvatar } from "../elements/player-avatar";
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

export interface PlayerBadgeProps {
  /** The player's crowns and attacks settled this season (the home's read): the rim's league. Left out: Wood, 0 crowns. */
  league?: { crowns: number; attacks?: number } | null;
  className?: string;
}

/**
 * The player card at the home's top left (#787, redrawn after the owner's direction of 2026-11-01, `docs/design/home.webp`): a
 * see-through dark grey card in a lighter grey rim, a black drop shadow round it; the avatar in the rim of the player's league with the
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
  const portrait = (
    <PlayerAvatar size="lg" live className="size-full p-0" player={avatarPlayer(value.state)} loading={value.state.status === "loading"} look={value.look} />
  );
  return (
    <div data-slot="player-badge" className={cn("flex", className)}>
      <button
        {...trigger}
        aria-label={`${profileLabel(value.state, undefined)}${progress ? `, ${levelLabel(progress)}` : ""}`}
        data-slot="player-card"
        // The mockup's card: a see-through dark grey face, a see-through lighter grey rim, a black drop shadow round it.
        className="state-layer flex max-w-[var(--profile-room,100%)] min-w-0 cursor-pointer items-center gap-2 rounded-2xl border-2 border-hud-card-rim/60 bg-hud-card/75 py-1 pr-3 pl-1 text-left shadow-[0_2px_8px] shadow-background backdrop-blur-sm outline-none focus-visible:ring-2 focus-visible:ring-ring tablet:gap-2.5 tablet:pr-4"
      >
        {/*
          The avatar in its rim, 64 px, 72 from `tablet` (the rim's square takes the box's font size), larger than the card: from its top it
          runs past the card's foot, the crest further (its negative margin keeps the card the height of the name and the bar).
        */}
        <span data-slot="avatar-rim" className="relative -mb-4 block shrink-0 self-start text-[4rem] tablet:-mb-5 tablet:text-[4.5rem]">
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
        <span className="flex min-w-0 flex-col gap-0.5">
          {name && (
            <span data-slot="player-name" title={name} className="text-outline min-w-0 truncate text-base leading-tight font-bold text-foreground tablet:text-lg">
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
