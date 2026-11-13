import { useCallback, useMemo } from "react";
import { DISCARD_POINTS, EXPEDITION_MAPS, PlanType, expeditionDayOf, expeditionNextTier, expeditionSeasonOf, expeditionWeekOf } from "@paved/game-core";
import { BoardNotice, NOTICE_ACTION } from "../../components/containers/board-notice";
import { toastError } from "../../components/containers/error-toast";
import { ExpeditionHand } from "../../components/containers/expedition-hand";
import type { HandState } from "../../components/containers/tile-stack";
import { TopBar } from "../../components/containers/top-bar";
import { InlineError } from "../../components/elements/inline-error";
import { BoardScene } from "../../components/scenes/board-scene";
import { useBoardSkins } from "../../data/board-skins";
import { useExpeditionSession, useOpenExpedition } from "../../data/expedition";
import type { ExpeditionGame, ExpeditionSnapshot } from "../../data/expedition-game";
import type { Slot } from "../../data/placement";
import { tierMeter } from "../../lib/score-meter";
import { errorDetail, useErrorDetail } from "../error-detail";
import { useGameBoard } from "../game-board";
import { useNow } from "../now";
import { usePuzzleViewer } from "../puzzle-play";
import { useUpTo } from "../ref";

const WEEK_PAGE = "/play/expedition";

/**
 * `/expedition` (the weekly individual event): the current account's board of this week on its session (`useExpeditionSession`), the
 * boards' scene with the Expedition's strip under its header (the map's name, its landmarks, the hand). The player picks a tile of the hand (the strip), then a lit slot,
 * turns the tile and lays it, as on Training's board; only the cells next to the trail are lit. The HUD shows the week's time left,
 * the score meter the next tier. A day that started since the last draw says so, its button drawing the day's tiles; the week over,
 * the board is read only. No board yet (the page opened by its address): the week's page opens it.
 */
export default function Page() {
  const viewer = usePuzzleViewer();
  const { game, snapshot, record, reload } = useExpeditionSession(viewer);
  const onBack = useUpTo(WEEK_PAGE);
  const readErrorDetail = useErrorDetail(record.error);
  if (!game || !snapshot) {
    const missing = (record.error as { kind?: string } | null)?.kind === "game-not-found" || record.error?.message === "Expedition: board does not exist";
    return (
      <div className="flex min-h-dvh flex-col bg-board text-foreground">
        <TopBar title="Expedition" onBack={onBack} />
        <main aria-busy={!record.error && !record.unavailable && viewer !== null} className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4">
          {missing ? (
            <p className="text-center text-sm text-muted-foreground">You have not opened this week's map yet: open it from the Expedition's page.</p>
          ) : record.error ? (
            <InlineError title="This board cannot be read" message={record.error.message} detail={readErrorDetail} />
          ) : record.unavailable ? (
            <p className="text-center text-sm text-muted-foreground">The Expedition is not on this network yet.</p>
          ) : (
            <p className="text-center text-sm text-muted-foreground">Reading the board…</p>
          )}
        </main>
      </div>
    );
  }
  return <ExpeditionPlay game={game} snapshot={snapshot} viewer={viewer} onReload={reload} onBack={onBack} />;
}

function ExpeditionPlay({ game, snapshot, viewer, onReload, onBack }: { game: ExpeditionGame; snapshot: ExpeditionSnapshot; viewer: string | null; onReload: () => void; onBack: () => void }) {
  const { record } = game;
  const skins = useBoardSkins(record.player);
  const now = useNow();
  const open = useOpenExpedition(viewer);
  const map = EXPEDITION_MAPS[expeditionSeasonOf(record.week)];
  const weekOver = now >= record.endsAt;
  const refused = snapshot.refused;
  const today = expeditionWeekOf(now) === record.week ? expeditionDayOf(now) : null;
  const newDay = today !== null && today > snapshot.lastDay;
  const playable = !weekOver && !refused;
  const tile = playable ? (snapshot.hand.find((c) => c.card === snapshot.selected) ?? null) : null;
  const slotsAt = useCallback((o: number) => game.slots(o), [game]);
  const orientationsAt = useCallback((cell: Slot) => game.orientationsAt(cell), [game]);
  // A new pick is a new tile in hand: the slot and the rotation chosen for the last one go.
  const { placement, scene } = useGameBoard({ skins, placement: { plan: tile?.plan ?? null, slotsAt, orientationsAt, version: snapshot, resetKey: tile?.card ?? null } });
  const { orientation, move, slots } = placement;
  const preview = useMemo(() => (move ? game.preview(move) : null), [game, snapshot, move]);
  const handErrorDetail = useErrorDetail(snapshot.writeError);

  const confirm = useCallback(() => {
    if (!placement.canConfirm || !move || preview === null) return;
    const ghost = placement.ghost;
    if (game.place(move)) {
      placement.accepted(ghost);
      placement.setOrientation(1);
    }
  }, [game, placement, move, preview]);

  const discard = useCallback(() => {
    placement.clear();
    game.discard();
  }, [game, placement]);

  const draw = () => {
    if (open.isPending) return;
    // The moves on their way are taken first: the board is read again after the draw.
    void game.idle().then(() => open.mutate(undefined, { onSuccess: onReload, onError: (error) => toastError({ title: "Expedition", message: error instanceof Error ? error.message : String(error), detail: errorDetail(error) }) }));
  };

  // The deck sheet's cards: the map's own tiles (the camp, the landmarks), on the board from the start, then the week's bag.
  const deck = useMemo(() => [PlanType.RFFFRFCFR, ...map.sites.flatMap((s) => s.tiles.map((t) => t.plan)), ...game.bag], [map, game]);
  const next = expeditionNextTier(snapshot.score);
  const handState: HandState = !tile ? "empty" : snapshot.writeError ? "refused" : "placing";
  const discardCost = Math.min(snapshot.score, DISCARD_POINTS);
  const bubble =
    placement.chosen && tile
      ? {
          cell: placement.chosen,
          rotations: placement.rotations.length,
          onRotate: placement.rotate,
          onClose: placement.clear,
          onDiscard: discard,
          discardCost,
          orientation,
          onConfirm: confirm,
          canConfirm: placement.canConfirm && preview !== null,
          busy: false,
        }
      : null;
  const board = scene({ tiles: snapshot.tiles, closed: snapshot.closed, bubble });
  const completed = snapshot.completed[0];
  const notices = (
    <>
      <ExpeditionHand tileArt={board.tileArt} hand={snapshot.hand} selected={tile?.card ?? null} onSelect={(card) => game.select(card)} toCome={snapshot.toCome} objectives={snapshot.objectives} map={map.name} disabled={!playable} className="pointer-events-auto w-full max-w-2xl" />
      {refused ? (
        <BoardNotice
          tone="warning"
          title="This move was refused"
          className="pointer-events-auto w-full max-w-2xl"
          action={
            <button type="button" className={NOTICE_ACTION} onClick={onReload}>
              Reload
            </button>
          }
        >
          {refused}. The board reads the game again.
        </BoardNotice>
      ) : weekOver ? (
        <BoardNotice tone="warning" title="The week is over" className="pointer-events-auto w-full max-w-2xl">
          This board takes no more tile: its tier is on the Expedition's page.
        </BoardNotice>
      ) : newDay ? (
        <BoardNotice
          title="A new day"
          className="pointer-events-auto w-full max-w-2xl"
          action={
            <button type="button" className={NOTICE_ACTION} disabled={open.isPending} onClick={draw}>
              Draw
            </button>
          }
        >
          Today's tiles wait: draw them into your hand.
        </BoardNotice>
      ) : completed ? (
        <BoardNotice title={completed.title} className="pointer-events-auto w-full max-w-2xl">
          Landmark done: +{completed.bonus} points.
        </BoardNotice>
      ) : null}
    </>
  );
  return (
    <BoardScene
      mode="expedition"
      score={snapshot.score}
      meter={next ? tierMeter(next.name, next.score, snapshot.score) : null}
      delta={snapshot.delta}
      remaining={snapshot.hand.length + snapshot.toCome}
      discardedPlans={snapshot.discardedPlans}
      expiresAt={record.endsAt}
      now={now}
      deckPlans={deck}
      hand={{
        tile: tile && { plan: tile.plan, orientation },
        state: handState,
        slotChosen: placement.canConfirm && preview !== null,
        cellChosen: placement.chosen !== null,
        fitsNowhere: tile !== null && slots?.length === 0,
        preview,
        error: snapshot.writeError,
        errorDetail: handErrorDetail,
      }}
      lastScored={snapshot.lastScored}
      {...board}
      readOnly={!playable}
      notices={notices}
      onBack={onBack}
      onDiscard={discard}
    />
  );
}
