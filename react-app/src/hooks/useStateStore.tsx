import { useMoveStore } from "@/store";

export const useStateStore = () => {
  const isSelected = useMoveStore((state) => state.isSelectedHex);
  const selectedHex = useMoveStore((state) => state.selectedHex);
  const setMoveToHex = useMoveStore((state) => state.setMoveToHex);

  const setSelectedHex = useMoveStore((state) => state.setSelectedHex);
  const moveToHex = useMoveStore((state) => state.moveToHex);
  const moves = useMoveStore((state) => state.moves);
  const setMoves = useMoveStore((state) => state.setMoves);
  const setMoveByDay = useMoveStore((state) => state.setMoveByDay);
  const loadMovesByDay = useMoveStore((state) => state.loadMovesByDay);
  const findSquadByCoordinates = useMoveStore(
    (state) => state.findSquadByCoordinates
  );
  const clearByDay = useMoveStore((state) => state.clearByDay);
  const clearByDayUUID = useMoveStore((state) => state.clearByDayUUID);

  const setMove = useMoveStore((state) => state.setMove);
  const move = useMoveStore((state) => state.move);
  const clearMove = useMoveStore((state) => state.clearMove);

  return {
    isSelected,
    selectedHex,
    setMoveToHex,
    moveToHex,
    moves,
    setMoves,
    setMoveByDay,
    loadMovesByDay,
    findSquadByCoordinates,
    clearByDay,
    clearByDayUUID,
    setMove,
    move,
    clearMove,
    setSelectedHex,
  };
};
