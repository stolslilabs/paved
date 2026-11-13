import { useState } from "react";
import { useSearchParams } from "react-router";
import { toastError } from "../../components/containers/error-toast";
import { ColossusScene, type ColossusView as View } from "../../components/scenes/colossus-scene";
import { useClaimColossus, useColossusBoard, useColossusBuilders, useColossusOptions, useColossusState, usePlaceColossus, type ColossusPlaced } from "../../data/colossus";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { useTileArt } from "../../data/tile-art";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useOpenPlayer } from "../open-player";
import { usePuzzleViewer } from "../puzzle-play";
import { useAppNavigate } from "../ref";

/** The board named by `?lot=` (0 the heart); null: none, or not a number. */
export const colossusLotOf = (param: string | null): number | null => (param !== null && /^\d{1,4}$/.test(param) ? Number(param) : null);

/** The Colossus's view named by the query: a board (`?lot=`), the builders (`?view=builders`); anything else, the site. */
export const colossusViewOf = (params: URLSearchParams): View => (colossusLotOf(params.get("lot")) !== null ? "board" : params.get("view") === "builders" ? "builders" : "site");

/** A refused write, as a toast: the page has no place for it. */
const refused = (error: unknown) => toastError({ title: "Colossus", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) });

/**
 * The Colossus (`/play/colossus`, Play's Limited mode): a view of Play's drawer, its own chunk, fetched as Play is pointed at (as the
 * Joust's). The week's site as the current account sees it (`useColossusState`); the builders and a board are views of it
 * (`?view=builders`, `?lot=`), pushed, so Back returns to the site. On a board the hand's pick is read where it may go
 * (`useColossusOptions`) and Place lays it (`usePlaceColossus`); Claim pays the tiers reached and last week's place.
 */
export default function ColossusView() {
  const me = usePuzzleViewer();
  const now = useNow();
  const go = useAppNavigate();
  const [params] = useSearchParams();
  const lot = colossusLotOf(params.get("lot"));
  const view = colossusViewOf(params);
  const state = useColossusState(me);
  const builders = useColossusBuilders(me, view === "builders");
  const board = useColossusBoard(me, lot);
  const [picked, setPicked] = useState<number | null>(null);
  // The pick holds while the card is in the hand: a tile laid, or gone at midnight, drops it.
  const selected = picked !== null && board.data?.hand.some((c) => c.card === picked) ? picked : null;
  const options = useColossusOptions(me, lot, selected);
  const place = usePlaceColossus(me);
  const claim = useClaimColossus(me);
  // What the last tile did, said on the board it was laid on.
  const [placed, setPlaced] = useState<{ lot: number; done: ColossusPlaced } | null>(null);
  const tileArt = useTileArt(RENDERER_ASSETS);
  const openPlayer = useOpenPlayer();
  const failed = view === "builders" ? builders : view === "board" ? board : state;
  return (
    <ColossusScene
      state={state.data ?? null}
      view={view}
      builders={builders.data ?? null}
      board={board.data ?? null}
      selected={selected}
      options={options.data ?? null}
      placed={placed && placed.lot === lot ? placed.done : null}
      error={state.unavailable ? "The Colossus is not on this network yet." : (failed.error?.message ?? state.error?.message ?? null)}
      errorDetail={failed.error ? errorDetail(failed.error) : state.error ? errorDetail(state.error) : undefined}
      onRetry={state.unavailable ? undefined : failed.error ? failed.refetch : state.refetch}
      now={now}
      busy={place.isPending ? "place" : claim.isPending ? "claim" : null}
      tileArt={tileArt}
      onSelect={setPicked}
      onPlace={(tile) =>
        place.mutate(tile, {
          onSuccess: (done) => {
            setPlaced({ lot: tile.board, done });
            setPicked(null);
          },
          onError: refused,
        })
      }
      onClaim={(week) => claim.mutate(week, { onError: refused })}
      onLot={(target) => {
        setPicked(null);
        go(`/play/colossus?lot=${target}`);
      }}
      onBuilders={() => go("/play/colossus?view=builders")}
      onOpenPlayer={openPlayer}
    />
  );
}
