import { useCallback, useMemo } from "react";
import { DISCARD_POINTS, PlanType, masterpieceKindOf } from "@paved/game-core";
import { BoardNotice, NOTICE_ACTION } from "../../components/containers/board-notice";
import { MasterpieceStrip } from "../../components/containers/masterpiece-strip";
import type { HandState } from "../../components/containers/tile-stack";
import { TopBar } from "../../components/containers/top-bar";
import { InlineError } from "../../components/elements/inline-error";
import { MASTERPIECE_KIND, pieceName } from "../../components/elements/masterpiece-kind";
import { BoardScene } from "../../components/scenes/board-scene";
import { useBoardSkins } from "../../data/board-skins";
import { useMasterpieceSession } from "../../data/masterpiece";
import type { MasterpieceGame, MasterpieceSnapshot } from "../../data/masterpiece-game";
import type { Slot } from "../../data/placement";
import { useErrorDetail } from "../error-detail";
import { useGameBoard } from "../game-board";
import { useNow } from "../now";
import { usePuzzleViewer } from "../puzzle-play";
import { useUpTo } from "../ref";

const WEEK_PAGE = "/play/masterpiece";

/**
 * `/masterpiece` (the weekly individual event): the current account's board of this week on its session (`useMasterpieceSession`),
 * the boards' scene with the Masterpiece's strip under its header (the masterpiece so far, the open structure being grown, the tiles
 * waiting). One tile in hand, as on Training's board: a lit slot, the tile turned, then laid. The HUD shows the masterpiece's score
 * and the week's time left. Today's tiles played, the board waits for midnight (UTC), which opens the next twelve by itself; the week
 * over, the board is read only. No board yet (the page opened by its address): the week's page opens it.
 */
export default function Page() {
  const viewer = usePuzzleViewer();
  const now = useNow();
  const { game, snapshot, record, reload } = useMasterpieceSession(viewer, now);
  const onBack = useUpTo(WEEK_PAGE);
  const readErrorDetail = useErrorDetail(record.error);
  if (!game || !snapshot) {
    const missing = (record.error as { kind?: string } | null)?.kind === "game-not-found" || record.error?.message === "Masterpiece: board does not exist";
    return (
      <div className="flex min-h-dvh flex-col bg-board text-foreground">
        <TopBar title="Masterpiece" onBack={onBack} />
        <main aria-busy={!record.error && !record.unavailable && viewer !== null} className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4">
          {missing ? (
            <p className="text-center text-sm text-muted-foreground">You have not opened this week's board yet: open it from the Masterpiece's page.</p>
          ) : record.error ? (
            <InlineError title="This board cannot be read" message={record.error.message} detail={readErrorDetail} />
          ) : record.unavailable ? (
            <p className="text-center text-sm text-muted-foreground">The Masterpiece is not on this network yet.</p>
          ) : (
            <p className="text-center text-sm text-muted-foreground">Reading the board…</p>
          )}
        </main>
      </div>
    );
  }
  return <MasterpiecePlay game={game} snapshot={snapshot} now={now} onReload={reload} onBack={onBack} />;
}

function MasterpiecePlay({ game, snapshot, now, onReload, onBack }: { game: MasterpieceGame; snapshot: MasterpieceSnapshot; now: number; onReload: () => void; onBack: () => void }) {
  const { record } = game;
  const skins = useBoardSkins(record.player);
  const kind = masterpieceKindOf(record.week);
  const weekOver = now >= record.endsAt;
  const refused = snapshot.refused;
  const playable = !weekOver && !refused && game.writable;
  const plan = playable ? snapshot.hand : null;
  const slotsAt = useCallback((o: number) => game.slots(o), [game]);
  const orientationsAt = useCallback((cell: Slot) => game.orientationsAt(cell), [game]);
  const { placement, scene } = useGameBoard({ skins, placement: { plan, slotsAt, orientationsAt, version: snapshot, resetKey: snapshot.played } });
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

  // The deck sheet's cards: the starter, on the board from the start, then the cards of the days opened so far (public once their day opens).
  const deck = useMemo(() => [PlanType.RFFFRFCFR, ...game.cards()], [game, snapshot.waiting, snapshot.toCome]);
  const handState: HandState = plan === null ? "empty" : snapshot.writeError ? "refused" : "placing";
  const bubble =
    placement.chosen && plan !== null
      ? {
          cell: placement.chosen,
          rotations: placement.rotations.length,
          onRotate: placement.rotate,
          onClose: placement.clear,
          onDiscard: discard,
          // Always its 50: they come off the masterpiece's points, closed or still to close.
          discardCost: DISCARD_POINTS,
          orientation,
          onConfirm: confirm,
          canConfirm: placement.canConfirm && preview !== null,
          busy: false,
        }
      : null;
  const board = scene({ tiles: snapshot.tiles, closed: snapshot.closed, bubble });
  const notices = (
    <>
      <MasterpieceStrip kind={kind} piece={snapshot.piece} prospect={snapshot.prospect} waiting={snapshot.waiting} toCome={snapshot.toCome} className="pointer-events-auto w-full max-w-2xl" />
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
          This board is frozen: its place and its tier are on the Masterpiece's page.
        </BoardNotice>
      ) : snapshot.improved && snapshot.piece ? (
        <BoardNotice title="A new masterpiece" className="pointer-events-auto w-full max-w-2xl">
          {pieceName(kind, snapshot.piece.size)}: it replaces your best {MASTERPIECE_KIND[kind].name} so far.
        </BoardNotice>
      ) : snapshot.waiting === 0 ? (
        <BoardNotice title={snapshot.toCome > 0 ? "Today's tiles are played" : "The week's tiles are played"} className="pointer-events-auto w-full max-w-2xl">
          {snapshot.toCome > 0 ? "Twelve new tiles at 00:00 UTC." : "Your masterpiece stands until Sunday 24:00 UTC."}
        </BoardNotice>
      ) : null}
    </>
  );
  return (
    <BoardScene
      mode="masterpiece"
      score={snapshot.score}
      delta={snapshot.delta}
      remaining={snapshot.waiting}
      discardedPlans={snapshot.discardedPlans}
      expiresAt={record.endsAt}
      now={now}
      deckPlans={deck}
      hand={{
        tile: plan === null ? null : { plan, orientation },
        state: handState,
        slotChosen: placement.canConfirm && preview !== null,
        cellChosen: placement.chosen !== null,
        fitsNowhere: plan !== null && slots?.length === 0,
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
