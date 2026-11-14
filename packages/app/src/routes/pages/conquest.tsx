import { useState } from "react";
import { useSearchParams } from "react-router";
import type { ConquestBranch } from "@paved/game-core";
import { toastError } from "../../components/containers/error-toast";
import { ConquestScene, type ConquestNotice } from "../../components/scenes/conquest-scene";
import { useClaimConquest, useConquestMembers, useConquestOptions, useConquestRanking, useConquestState, useConquestZone, useExploreConquest, useGiveConquest, useOfferConquest, useRegisterConquest, useRequestConquest, useResearchConquest } from "../../data/conquest";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { useTileArt } from "../../data/tile-art";
import { conquestViewOf, conquestZoneOf } from "../conquest-play";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useOpenPlayer } from "../open-player";
import { usePuzzleViewer } from "../puzzle-play";
import { useAppNavigate } from "../ref";

/** A refused write, as a toast: the page has no place for it. */
const refused = (error: unknown) => toastError({ title: "Conquest", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) });

/**
 * The Conquest (`/play/conquest`, Play's Limited mode): a view of Play's drawer, its own chunk, fetched as Play is pointed at (as the
 * Joust's). The Conquest as the current account sees it (`useConquestState`); the map (`?zone=`), the tree, the ranking and the
 * members (`?view=`) are views of it, pushed, so Back returns to its page. Its writes: Register, the Offerings, the day's
 * exploration, a build request, a gift, a level of the tree, and Claim; what the last one did is said at the top of the view.
 */
export default function ConquestView() {
  const me = usePuzzleViewer();
  const now = useNow();
  const go = useAppNavigate();
  const [params] = useSearchParams();
  const view = conquestViewOf(params);
  const zoneIndex = conquestZoneOf(params.get("zone"));
  const state = useConquestState(me);
  const zone = useConquestZone(me, zoneIndex);
  const ranking = useConquestRanking(me, view === "ranking");
  const members = useConquestMembers(me, view === "members");
  // The cell picked on the map, of the zone shown: another zone drops it.
  const [picked, setPicked] = useState<{ zone: number; x: number; y: number } | null>(null);
  const cell = picked && picked.zone === zoneIndex ? { x: picked.x, y: picked.y } : null;
  const leads = state.data?.leads ?? false;
  const options = useConquestOptions(me, leads ? cell : null);
  const [notice, setNotice] = useState<ConquestNotice | null>(null);
  const [researching, setResearching] = useState<ConquestBranch | null>(null);
  const register = useRegisterConquest(me);
  const offer = useOfferConquest(me);
  const explore = useExploreConquest(me);
  const request = useRequestConquest(me);
  const give = useGiveConquest(me);
  const research = useResearchConquest(me);
  const claim = useClaimConquest(me);
  const tileArt = useTileArt(RENDERER_ASSETS);
  const openPlayer = useOpenPlayer();
  const failed = view === "map" ? zone : view === "ranking" ? ranking : view === "members" ? members : state;
  const done = (said: ConquestNotice) => {
    setNotice(said);
    setPicked(null);
  };
  return (
    <ConquestScene
      state={state.data ?? null}
      view={view}
      zone={zone.data ?? null}
      cell={cell}
      options={options.data ?? null}
      ranking={ranking.data ?? null}
      members={members.data ?? null}
      error={state.unavailable ? "The Conquest is not on this network yet." : (failed.error?.message ?? state.error?.message ?? null)}
      errorDetail={failed.error ? errorDetail(failed.error) : state.error ? errorDetail(state.error) : undefined}
      onRetry={state.unavailable ? undefined : failed.error ? failed.refetch : state.refetch}
      now={now}
      busy={register.isPending ? "register" : offer.isPending ? "offer" : explore.isPending ? "explore" : request.isPending ? "request" : give.isPending ? "give" : research.isPending ? "research" : claim.isPending ? "claim" : null}
      researching={researching}
      notice={notice}
      tileArt={tileArt}
      onRegister={() => register.mutate(undefined, { onSuccess: () => done({ kind: "register" }), onError: refused })}
      onOffer={() => offer.mutate(undefined, { onSuccess: (made) => done({ kind: "offer", ...made }), onError: refused })}
      onExplore={(at) => explore.mutate(at, { onSuccess: (found) => done({ kind: "explore", ...found }), onError: refused })}
      onRequest={(tile) => request.mutate(tile, { onSuccess: () => done({ kind: "request" }), onError: refused })}
      onGive={(id) => give.mutate(id, { onSuccess: (given) => done({ kind: "give", given }), onError: refused })}
      onResearch={(branch) => {
        setResearching(branch);
        research.mutate(branch, { onSuccess: ({ level }) => done({ kind: "research", branch, level }), onError: refused });
      }}
      onClaim={(conquest) => claim.mutate(conquest, { onSuccess: ({ cobbles }) => done({ kind: "claim", cobbles }), onError: refused })}
      onZone={(target) => {
        setNotice(null);
        setPicked(null);
        go(`/play/conquest?zone=${target}`, zoneIndex !== null ? { replace: true } : undefined);
      }}
      onCell={(at) => setPicked(at && zoneIndex !== null ? { zone: zoneIndex, ...at } : null)}
      onView={(target) => {
        setNotice(null);
        go(target === "hub" ? "/play/conquest" : `/play/conquest?view=${target}`);
      }}
      onAllegiance={() => go("/guild")}
      onOpenPlayer={openPlayer}
    />
  );
}
