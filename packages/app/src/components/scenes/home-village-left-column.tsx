import { Suspense, lazy } from "react";
import { cn } from "../../lib/utils";
import { HUD_CAPSULES_NUDGE } from "../elements/hud-inset";
import { Countdown } from "../elements/countdown";
import { formatPoints } from "../elements/score";
import { Icon } from "../ui/icon";
import { VillageScore } from "../containers/village-score";
import type { HomeVillageSceneProps } from "./home-village-scene";

// The League control (#829) and its plate in their own chunk: a stand-in of its height holds its place meanwhile (FIRST-LOAD).
const LazyLeagueControl = lazy(() => import("../containers/league-control").then((m) => ({ default: m.LeagueControl })));
// The shield's plate and its popover (#806, #829): their own chunk, loaded only while the village is shielded (FIRST-LOAD).
const LazyShieldPlate = lazy(() => import("../elements/shield-plate").then((m) => ({ default: m.ShieldPlate })));

/** The League control's box while its chunk arrives (its 44 px touch height at every width): nothing under it moves when it comes. */
const LEAGUE_STAND_IN = <span aria-hidden className="block h-11" />;

/** The left column's controls (#829, #856): the capsules, then the chips. */
export function HomeLeftColumn({
  village,
  editable,
  onEdit,
  ...props
}: HomeVillageSceneProps & {
  editable: boolean;
  onEdit: () => void;
}) {
  const { activeGame, now } = props;
  // The score just saved, until the village's read has it too.
  const shown = props.saved?.score ?? village?.score ?? 0;
  return (
    <>
      {/*
        The capsules (HOME-UI-CAPSULES), in the mockup's order: the League control (the crowns, #829), the village score (#755), the
        shield's while shielded, stretched to one width, the widest's, and close (their 44 px targets 4 px apart). The group lets taps
        through between them.
      */}
      <div data-slot="home-capsules" data-bubble-avoid className={cn("relative flex flex-col items-stretch gap-1 pointer-events-none! [&>*]:pointer-events-auto", HUD_CAPSULES_NUDGE)}>
        <Suspense fallback={LEAGUE_STAND_IN}>
          <LazyLeagueControl crowns={props.league?.crowns} attacks={props.league?.attacks} onLeague={props.onLeague} />
        </Suspense>
        {village && (
          // A tap opening edit mode (HOME-UI-CAPSULES; #831's accordion went).
          <VillageScore score={shown} saved={props.saved} onEdit={editable ? onEdit : undefined} />
        )}
        {props.shieldEndsAt != null && props.shieldEndsAt > now && (
          <Suspense fallback={null}>
            <LazyShieldPlate endsAt={props.shieldEndsAt} now={now} />
          </Suspense>
        )}
      </div>
      {/* The chips, in the same column (#856), clear of the right column. */}
      <>
        {activeGame && (
          <button
            type="button"
            onClick={() => props.onResume?.(activeGame.id)}
            aria-label={`Resume Challenge #${activeGame.id}`}
            className="state-layer pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-primary/50 bg-card/90 py-1.5 pr-3 pl-1.5 text-xs shadow-lg backdrop-blur outline-none"
          >
            <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
              <Icon name="play" size="xs" />
            </span>
            <span className="font-semibold">Resume #{activeGame.id}</span>
            <span className="numeric hidden text-muted-foreground min-[24.5rem]:inline">{formatPoints(activeGame.score)} pts</span>
            <Countdown expiresAt={activeGame.expiresAt} now={now} hideLabel />
          </button>
        )}
        {props.spawnPaused && (
          <span role="status" className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-warning/50 bg-card/90 px-3 py-1.5 text-xs backdrop-blur">
            <Icon name="circle-pause" size="xs" className="text-warning" />
            New Challenge games are paused
          </span>
        )}
      </>
    </>
  );
}
