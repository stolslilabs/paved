import { Suspense, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { UNSAFE_DataRouterContext, useBlocker, useLocation, useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BoardTile } from "@paved/chain";
import { shortAddress } from "../../components/elements/short-address";
import type { LayoutSaved } from "../../components/containers/layout-editor";
import type { VillageLayout } from "../../components/containers/layout-rules";
import { HomeVillageScene } from "../../components/scenes/home-village-scene";
import { useBoardSettings } from "../../data/board-settings";
import { useActiveGame, useSpawnPaused } from "../../data/chain";
import { cobbleKeys } from "../../data/cobbles";
import { useChests, useFreeVillageHeld, useFreeVillageWrites } from "../../data/free-village-base";
import { queryKeys } from "../../data/keys";
import { usePvpLeague, usePvpShield } from "../../data/pvp-league";
import { useMissionsReady } from "../../data/quests";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { chestsBadge, chestsSeenDay, utcDay } from "../chests-seen";
import { useConnectError } from "../connect-error";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { PrefetchOnIntent } from "../prefetch";
import { scoreOpenStored, storeScoreOpen } from "../score-open";
import { useAppNavigate, useTabNavigate } from "../ref";
import { boardTilesOf, layoutTilesOf, refusalText } from "../village-shapes";

/** The village's stage as the app wires it (the editor, the engine, the art; the renderer after it): the overlays paint first. */
const HomeStage = lazy(() => import("../home-stage"));
/** The leave dialog, its own chunk: loaded only when a leave is blocked. */
const LeaveDialog = lazy(() => import("../leave-dialog"));

/** The query key of edit mode: `/?edit`. */
const EDIT = "edit";

/**
 * `/` (#753, PvP v2 step 1): the player's own village full screen, the home of the game. The village, its inventory and the
 * level from `useFreeVillage` (the mock ledger in step 1, #741), the chests waiting, today's missions to claim, the crowns and
 * league (`Matchmaker.league`, Wood before any PvP: the badge is the home's way to the league, #755), the active
 * Challenge game and the spawn pause. The overlays paint first; the stage (`home-stage.tsx`: the editor, the engine, the tile art)
 * and then the 3D scene (`home-canvas.tsx`) load lazily under them, the plan view where WebGL is
 * missing or the renderer cannot start. Edit mode is in the URL (`?edit`, an entry of its own), so Back leaves it first; leaving
 * it with changes not saved, by any way (Back, a link, a reload), asks first. A guest, and a player whose source does not
 * serve the v2 village yet, see a starter village, read only. The welcome comes first on a first visit (the router's loader).
 */
export default function Page() {
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const editing = params.has(EDIT);
  const now = useNow();
  const wallet = useAccount();
  useConnectError(wallet.error);
  const sources = useDataSources();
  const client = useQueryClient();
  const me = sources.signer?.address ?? wallet.address ?? null;
  const read = useFreeVillageHeld(me);
  const chests = useChests(me);
  // Read at each render: the home is drawn again on the way back from the Chests page, which marks the day seen.
  const seenDay = chestsSeenDay();
  // The day's slots count from 0 at each UTC day (#759): a home left open across midnight reads the chests again, and until that
  // read is in, a read of yesterday counts none of today's slots as won.
  const day = utcDay(now);
  const chestsKey = queryKeys.chain.v2.chests(me ?? "0x0");
  const chestsReadDay = utcDay((client.getQueryState(chestsKey)?.dataUpdatedAt ?? 0) / 1000);
  const shownDay = useRef(day);
  useEffect(() => {
    if (shownDay.current === day) return;
    shownDay.current = day;
    if (me) void client.invalidateQueries({ queryKey: chestsKey });
  }, [day, me, client, chestsKey]);
  const writes = useFreeVillageWrites(me);
  const active = useActiveGame(wallet.address);
  const paused = useSpawnPaused();
  const missions = useMissionsReady(me);
  const league = usePvpLeague(me).data;
  const shield = usePvpShield(me).data;
  const board = useBoardSettings();
  const [saved, setSaved] = useState<LayoutSaved | null>(null);
  // The village score's fold (#831), as this device left it: read once, as the home opens.
  const [initialScoreOpen] = useState(scoreOpenStored);
  const [dirty, setDirty] = useState(false);
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  const owner = wallet.username ?? (me ? shortAddress(me) : "");
  const data = read.data;
  // Not served (the chain before step 3), or a guest: a starter village to look at.
  const readOnly = me === null || data === null;
  // A starter village is laid out and scored by the engine, loaded on demand.
  const starter = useQuery({
    queryKey: ["home", "starter", owner, me],
    queryFn: async () => (await import("../starter-village")).starterVillage(owner, me),
    enabled: readOnly,
    staleTime: Infinity,
  });
  const village = useMemo<VillageLayout | undefined>(() => {
    if (readOnly) return starter.data;
    return data ? { owner, level: data.level, tiles: boardTilesOf(data.tiles), score: data.score } : undefined;
  }, [readOnly, starter.data, data, owner]);
  const pending = writes.pending?.kind;

  // Edit mode's way out from the scene (Back with nothing to lose, Leave asked, a save that landed): the entry Edit pushed goes,
  // or, opened on `/?edit`, the URL drops the mode. Neither asks again.
  const leaving = useRef(false);
  useEffect(() => {
    leaving.current = false;
  }, [location.key]);
  const fromView = (location.state as { fromView?: boolean } | null)?.fromView === true;
  const onEditingChange = (next: boolean) => {
    if (next === editing) return;
    if (next) return void go(`/?${EDIT}`, { state: { fromView: true } });
    leaving.current = true;
    if (fromView) navigate(-1);
    else go("/", { replace: true });
  };

  // A reload or a closed tab leaves the document: the browser's own prompt asks first.
  useEffect(() => {
    if (!dirty) return;
    const ask = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);
  // The app's router is a data router, so leaving by any way is guarded; a plain one (Storybook's) has only the editor's Back.
  const guarded = useContext(UNSAFE_DataRouterContext) !== null;

  const save = (tiles: readonly BoardTile[], score: number, slot?: number) => {
    if (pending || !village) return;
    writes.reset();
    const layout = layoutTilesOf(tiles);
    const previous = village.score;
    writes.save(layout, slot).then(
      () => setSaved({ score, previous }),
      () => undefined,
    );
  };
  const found = () => {
    if (pending) return;
    writes.reset();
    writes.found().then(
      () => toast.success("Village founded", { description: "Its starter layout is yours. Edit it at any time." }),
      () => undefined,
    );
  };

  const failed = readOnly ? null : read.error;
  return (
    <PrefetchOnIntent routes={["/play", "/missions", "/village/chests", "/village/shop", "/vault", "/pvp/league", "/settings"]}>
      <HomeVillageScene
        village={village}
        error={failed && data === undefined ? { message: failed.message, detail: errorDetail(failed) } : null}
        guest={me === null}
        readOnly={readOnly}
        editing={editing}
        initialScoreOpen={initialScoreOpen}
        onScoreOpenChange={storeScoreOpen}
        onEditingChange={onEditingChange}
        founded={data?.founded ?? true}
        founding={pending === "found"}
        saving={pending === "save"}
        saved={saved}
        refusal={writes.error ? refusalText(writes.error) : null}
        refusalDetail={writes.error ? errorDetail(writes.error) : undefined}
        chests={
          chests.data
            ? chestsBadge({
                waiting: chests.data.pending.length + (chests.data.open ? 1 : 0),
                pvpToday: chests.data.pvpToday,
                pvpCap: chests.data.pvpCap,
                readDay: chestsReadDay,
                day,
                seenDay,
              })
            : 0
        }
        missions={missions}
        league={league}
        shieldEndsAt={shield?.up ? shield.until : null}
        activeGame={wallet.address ? (active.data ?? null) : null}
        spawnPaused={paused.data ?? false}
        now={now}
        seasonWheel={board.wheel}
        renderStage={(stage) => <HomeStage {...stage} playerId={me} held={data ?? null} settings={board.renderer} onScene={board.onScene} />}
        onPlay={() => go("/play")}
        onMissions={() => go("/missions")}
        onChests={() => go("/village/chests")}
        onShop={() => go("/village/shop")}
        onVault={() => go("/vault")}
        onLeague={() => go("/pvp/league")}
        onSettings={() => go("/settings")}
        onNavigate={onNavigate}
        onResume={(id) => go(`/game/${id}`)}
        onRetry={() => {
          void client.invalidateQueries({ queryKey: queryKeys.chain.v2.all });
          void client.invalidateQueries({ queryKey: cobbleKeys.all });
        }}
        onFound={found}
        onSave={save}
        onDirtyChange={onDirtyChange}
        onDismissSaved={() => setSaved(null)}
        onDismissRefusal={writes.reset}
      />
      {guarded && <LeaveGuard when={dirty} leaving={leaving} />}
    </PrefetchOnIntent>
  );
}

/** Leaving edit mode with changes not saved (the system Back, a link) asks first; the scene's own ways out have asked already. */
function LeaveGuard({ when, leaving }: { when: boolean; leaving: { current: boolean } }) {
  const blocker = useBlocker(() => when && !leaving.current);
  if (blocker.state !== "blocked") return null;
  return (
    <Suspense fallback={null}>
      <LeaveDialog onStay={() => blocker.reset?.()} onLeave={() => blocker.proceed?.()} />
    </Suspense>
  );
}
