import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlaceMove } from "@paved/game-core";
import { BoardViewport } from "../../components/containers/board-viewport";
import { TileView, hasWebGL } from "../../components/containers/tile-view";
import { BoardScene } from "../../components/scenes/board-scene";
import { useTrainingSession } from "../../data/training";
import { useRoutePage } from "../handle";
import { Placeholder } from "../Placeholder";
import { useAppNavigate, useBack } from "../ref";

/**
 * Where the renderer finds its models and tile art (`models/<plan>.glb`, `assets/tiles/<plan>.png`, `draco/`): app-web's
 * `public/`, served at this path by `vite/renderer-assets.ts` in dev and preview, copied into `dist/` at build. If a model
 * does not load, or the browser has no WebGL, the board falls back to the plan view, which plays the same game.
 */
const RENDERER_ASSETS = `${import.meta.env.BASE_URL}renderer-assets`;

type Slot = { x: number; y: number };
const same = (a: Slot | null, b: Slot | null) => a !== null && b !== null && a.x === b.x && a.y === b.y;

/** `/training` (P3); the Challenge board (P5) and the Tutorial (P6) are still placeholders. */
export default function Page() {
  const page = useRoutePage();
  return page?.path === "training" ? <TrainingBoard /> : <Placeholder />;
}

/**
 * The Training board on its `LocalSession` (P3). The player picks a lit slot (a tap or a click; on a mouse, the hover
 * shows the ghost too), turns the tile, then places it: the move sent is built from the slot the ghost shows, through
 * `toChainSlot` (D1, #379). A finished game goes to `/training/over`.
 */
function TrainingBoard() {
  const { game, snapshot, board } = useTrainingSession();
  const go = useAppNavigate();
  const onBack = useBack();
  const [orientation, setOrientation] = useState(1);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [hovered, setHovered] = useState<Slot | null>(null);
  // The 3D board, unless this browser has no WebGL or the renderer cannot start (its models not served): the plan view.
  const [view, setView] = useState<"3d" | "plan">(() => (hasWebGL() ? "3d" : "plan"));

  const hand = board.hand;
  // `snapshot` changes with every move: the slots are those of the tile now in hand.
  const slots = useMemo(() => (hand ? game.slots(orientation) : []), [game, snapshot, hand, orientation]);
  const target = chosen ?? (hovered && slots.some((s) => same(s, hovered)) ? hovered : null);
  const move = useMemo<PlaceMove | null>(() => (target && hand ? { orientation, x: target.x, y: target.y } : null), [target, hand, orientation]);
  const preview = useMemo(() => (move ? game.preview(move) : null), [game, snapshot, move]);
  const ghost = move && hand && preview !== null ? { ...move, plan: hand.plan } : null;

  // Another game (another tab's save followed, a new game): the slot and orientation chosen for the old hand go.
  useEffect(() => {
    setChosen(null);
    setOrientation(1);
  }, [game]);

  useEffect(() => {
    if (board.over) go("/training/over", { replace: true });
  }, [board.over, go]);

  // A cell is chosen in any orientation the tile fits there: the first one, unless the current one fits.
  const choose = useCallback(
    (cell: Slot) => {
      const fits = game.orientationsAt(cell);
      if (fits.length === 0) return;
      setChosen(cell);
      if (!fits.includes(orientation)) setOrientation(fits[0]!);
    },
    [game, orientation],
  );

  // On a chosen slot the tile turns through the orientations that fit there; otherwise through all four.
  const rotate = useCallback(() => {
    const fits = chosen ? game.orientationsAt(chosen) : [1, 2, 3, 4];
    const next = fits.find((o) => o > orientation) ?? fits[0];
    if (next !== undefined) setOrientation(next);
  }, [game, chosen, orientation]);

  const confirm = useCallback(async () => {
    if (!move || preview === null) return;
    setChosen(null);
    if (await game.place(move)) setOrientation(1);
  }, [game, move, preview]);

  const discard = useCallback(() => {
    setChosen(null);
    void game.discard();
  }, [game]);

  const surrender = useCallback(() => void game.surrender(), [game]);

  const state = snapshot.state;
  const handState = !hand || board.over ? "empty" : state.writeError ? "refused" : "placing";
  return (
    <BoardScene
      mode="training"
      tiles={board.tiles}
      score={board.score}
      delta={snapshot.delta}
      remaining={board.remaining}
      expiresAt={null}
      now={Math.floor(Date.now() / 1000)}
      hand={{ tile: hand && { plan: hand.plan, orientation }, state: handState, slotChosen: move !== null && preview !== null, preview, error: state.writeError }}
      lastScored={board.lastScored}
      tileArt={view === "3d" ? RENDERER_ASSETS : undefined}
      renderHandTile={view === "3d" ? (t) => <TileView {...t} basePath={RENDERER_ASSETS} /> : undefined}
      storageDisabled={snapshot.storage === "off"}
      saveDropped={snapshot.storage === "dropped"}
      slots={slots}
      ghost={ghost}
      onSlotClick={choose}
      canvas={
        view === "3d" ? (
          <BoardViewport
            tiles={board.tiles}
            basePath={RENDERER_ASSETS}
            slots={slots}
            ghost={ghost}
            onCellClick={choose}
            onCellHover={setHovered}
            onError={() => setView("plan")}
          />
        ) : undefined
      }
      onBack={onBack}
      onRotate={rotate}
      onConfirm={confirm}
      onDiscard={discard}
      onSurrender={surrender}
    />
  );
}
