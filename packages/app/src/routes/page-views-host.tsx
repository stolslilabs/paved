import { lazy, Suspense, useCallback, useLayoutEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { DrawerOrderContext, HudDrawer, useOpenDrawer } from "../components/containers/hud-drawer";
import { GUILD_PARAM, guildParamOf } from "./guild-param";
import { useRoutePage } from "./handle";
import { PLAYER_PARAM, viewsOf, type PageView, type PageViewsState } from "./player-param";

// The pages the URL opens over any page (DRAWER-NAV-IN-PLACE, #1064): a player's profile (`?player=`, #952) and another guild's
// (`?guild=`, #953). Each draws itself in the open drawer's place (`HudDrawer`'s `inPlace`), with Back to the page it covers; with
// none open (the home, a link), in the drawer they share here. A chain (a profile, its guild, a member...) is a stack: the URL names
// the page on top, the history entry the pages it covers (`below`), and each of them stays mounted under the next, as it was (its
// scroll, its tab), so that Back shows it again unchanged. Its own chunk, fetched once one is asked for (`player-profile.tsx`).

/** A player's profile and its reads: its own chunk, fetched at the first opening. */
const PlayerProfile = lazy(() => import("./player-profile-sheet"));
/** A guild's page and the reads it needs: in the guild page's chunk (`pages/guild.tsx`), fetched once a guild is asked for. */
const GuildView = lazy(() => import("./pages/guild").then((m) => ({ default: m.GuildView })));

/** The pages of the entry, oldest first: those the history entry keeps under the URL's, then the URL's (a profile before a guild). */
function stackOf(params: URLSearchParams, state: unknown): PageView[] {
  const player = params.get(PLAYER_PARAM);
  const guild = params.get(GUILD_PARAM);
  const top: PageView | null = player !== null ? { kind: "player", id: player } : guildParamOf(guild) !== null ? { kind: "guild", id: guild! } : null;
  if (!top) return [];
  const below = ((state as PageViewsState | null)?.below ?? []).filter((v) => v.kind === "player" || guildParamOf(v.id) !== null);
  return [...below, top];
}

const samePages = (a: readonly PageView[], b: readonly PageView[]) => a.length === b.length && a.every((v, i) => v.kind === b[i]!.kind && v.id === b[i]!.id);

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
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const page = useRoutePage();
  const stack = stackOf(params, state);
  // A drawer's page: the pages wait for its drawer, to be drawn in it (a link to `/friends?player=`); else in their own.
  const drawn = useOpenDrawer();
  const ready = page?.drawer !== true || drawn;
  // The pages drawn: the entry's, kept once none is left, so that they stay in the drawer as it slides out. Each chain from none is a
  // new opening, its pages mounted afresh (their reads and clocks those of the moment they open).
  const [shown, setShown] = useState<{ pages: PageView[]; opening: number; closed: boolean }>({ pages: [], opening: 0, closed: true });
  const open = ready && stack.length > 0;
  if (open && (shown.closed || !samePages(stack, shown.pages))) setShown({ pages: stack, opening: shown.closed ? shown.opening + 1 : shown.opening, closed: false });
  else if (stack.length === 0 && !shown.closed) setShown({ ...shown, closed: true });
  // The page on top's Back (the covered ones' are never called): back when the app opened it, else its parameter dropped in place.
  const close = useCallback(() => {
    const held = state as PageViewsState | null;
    if (held?.playerSheet || held?.guildSheet) return void navigate(-1);
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
    <>
      <ViewsDrawer open={stack.length > 0 && page?.drawer !== true} />
      {shown.pages.map((v, i) => (
        // One boundary each: a page whose code is on its way never hides those already drawn.
        <Suspense key={`${shown.opening}:${i}:${v.kind}:${v.id}`} fallback={null}>
          {/* Its place in the chain: the drawer stacks the pages in this order, whichever code comes first. */}
          <DrawerOrderContext.Provider value={i}>
            {v.kind === "player" ? <PlayerProfile playerId={v.id} open={open} onClose={close} /> : <GuildView id={Number(v.id)} open={open} onClose={close} />}
          </DrawerOrderContext.Provider>
        </Suspense>
      ))}
    </>
  );
}
