import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { GameScene } from "@paved/renderer";
import { BoardViewport, toGridSlot } from "../../components/containers/board-viewport";
import { type Slot, usePlacement } from "../../data/placement";
import { TrainingGame } from "../../data/training";
import { APP_ASSETS } from "../../mocks/assets";

/**
 * Press and place (PRESS-PLACE, #680) on a Training game of a fixed seed, as the Training board plays it: a long press on a
 * lit cell shows the tile there and fills Validate's ring at once; held to the end, the tile is placed. A tap still only
 * shows the tile; let go early, it stays shown. The root's `data-target` is the screen point (CSS px) of the first lit
 * cell's centre, for the captures; `data-placed` counts the tiles placed.
 */
export function PressPlaceBoard({ seed = 1n }: { seed?: bigint }) {
  const game = useMemo(() => TrainingGame.start(seed, () => null), [seed]);
  const snapshot = useSyncExternalStore(
    useCallback((listener: () => void) => game.subscribe(listener), [game]),
    () => game.snapshot,
  );
  const state = snapshot.state;
  const slotsAt = useCallback((o: number) => game.slots(o), [game]);
  const orientationsAt = useCallback((cell: Slot) => game.orientationsAt(cell), [game]);
  const placement = usePlacement({ plan: state.hand?.plan ?? null, slotsAt, orientationsAt, version: snapshot, resetKey: game });
  const { move, ghost, slots, orientation } = placement;
  const [placing, setPlacing] = useState(false);
  const confirm = useCallback(async () => {
    if (!placement.canConfirm || !move) return;
    const shown = placement.ghost;
    setPlacing(true);
    try {
      if (await game.place(move)) placement.accepted(shown);
    } finally {
      setPlacing(false);
    }
  }, [game, placement, move]);
  const bubble = placement.chosen
    ? {
        cell: placement.chosen,
        rotations: placement.rotations.length,
        onRotate: placement.rotate,
        onClose: placement.clear,
        orientation,
        onConfirm: () => void confirm(),
        canConfirm: placement.canConfirm,
        busy: placing,
      }
    : null;

  // The first lit cell's centre on screen: halfway between its top-right corner and its south-west neighbour's.
  const [scene, setScene] = useState<GameScene | null>(null);
  const [target, setTarget] = useState<string | undefined>();
  const first = slots?.[0];
  useEffect(() => {
    if (!scene || !first) return setTarget(undefined);
    const cell = toGridSlot(first.x, first.y);
    const measure = () => {
      const a = scene.projectCell(cell.x, cell.y);
      const b = scene.projectCell(cell.x - 1, cell.y + 1);
      setTarget(a && b ? `${Math.round((a.x + b.x) / 2)},${Math.round((a.y + b.y) / 2)}` : undefined);
    };
    measure();
    return scene.onCameraChange(measure);
  }, [scene, first?.x, first?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-board" data-target={target} data-placed={state.tiles.length - 1}>
      <BoardViewport
        tiles={state.tiles}
        basePath={APP_ASSETS}
        slots={slots}
        ghost={ghost}
        confirmed={placement.confirmed}
        bubble={bubble}
        onScene={setScene}
        onCellClick={placement.choose}
        onCellPress={placement.choose}
        onCellHover={placement.setHovered}
      />
    </div>
  );
}
