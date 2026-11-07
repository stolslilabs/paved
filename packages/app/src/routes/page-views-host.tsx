import { lazy, Suspense, useCallback, useLayoutEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { HudDrawer, useOpenDrawer } from "../components/containers/hud-drawer";
import { GUILD_PARAM, guildParamOf } from "./guild-param";
import { useRoutePage } from "./handle";
import PlayerProfileHost from "./player-profile-host";
import { PLAYER_PARAM, viewsOf } from "./player-param";

// The pages the URL opens over any page (DRAWER-NAV-IN-PLACE, #1064): a player's profile (`?player=`, #952) and another guild's
// (`?guild=`, #953). Each draws itself in the open drawer's place (`HudDrawer`'s `inPlace`), with Back to the page it covers; with
// none open (the home, a link), in the drawer they share here, so that a profile, its guild, a member... follow in one drawer.
// Its own chunk, fetched once one is asked for (`player-profile.tsx`).

/** Another guild's page and the reads it needs: the guild page's chunk, fetched once a guild is asked for. */
const GuildViewHost = lazy(() => import("./social/guild-view-host"));

/**
 * The drawer the pages share when none is open: on the right, as the others' profiles are, empty under them. Its close leaves them
 * all: back past those the app opened in a row (`views`), else the parameters dropped in place (a link from outside).
 */
function ViewsDrawer({ open }: { open: boolean }) {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [, setParams] = useSearchParams();
  const close = useCallback(() => {
    const n = viewsOf(state);
    if (n > 0) return void navigate(-n);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(PLAYER_PARAM);
        next.delete(GUILD_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [state, navigate, setParams]);
  return (
    <HudDrawer open={open} onOpenChange={(next) => !next && close()} title="Player" side="right" slot="page-views">
      {null}
    </HudDrawer>
  );
}

/** The hosts mounted (the home's, and a page's drawn without the home under it): the first one serves alone. */
let hosts: readonly symbol[] = [];
const hostsListeners = new Set<() => void>();

export default function PageViewsHost() {
  const [me] = useState(() => Symbol("pages host"));
  const [first, setFirst] = useState(false);
  // In a layout effect, read again once listed, so the first host serves before paint.
  useLayoutEffect(() => {
    const update = () => setFirst(hosts[0] === me);
    hostsListeners.add(update);
    hosts = [...hosts, me];
    hostsListeners.forEach((l) => l());
    return () => {
      hostsListeners.delete(update);
      hosts = hosts.filter((h) => h !== me);
      hostsListeners.forEach((l) => l());
    };
  }, [me]);
  return first ? <PageViews /> : null;
}

function PageViews() {
  const [params] = useSearchParams();
  const page = useRoutePage();
  const player = params.has(PLAYER_PARAM);
  const guild = guildParamOf(params.get(GUILD_PARAM)) !== null;
  // A drawer's page: the pages wait for its drawer, to be drawn in it (a link to `/friends?player=`); else in their own.
  const drawn = useOpenDrawer();
  const ready = page?.drawer !== true || drawn;
  // Each host kept once asked: the page it shows stays as it slides out.
  const [live, setLive] = useState({ player: false, guild: false });
  if (ready && ((player && !live.player) || (guild && !live.guild))) setLive({ player: live.player || player, guild: live.guild || guild });
  return (
    <>
      <ViewsDrawer open={(player || guild) && page?.drawer !== true} />
      {live.player && <PlayerProfileHost />}
      {live.guild && (
        <Suspense fallback={null}>
          <GuildViewHost />
        </Suspense>
      )}
    </>
  );
}
