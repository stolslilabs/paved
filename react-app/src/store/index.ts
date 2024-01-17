import { uuid } from "@latticexyz/utils";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Move {
  squadId: number;
  x: number;
  y: number;
  qty: number;
  hash: string;
  timestamp: number;
  committed: boolean;
  revealed: boolean;
  uuid: string;
}

interface Hex {
  col: number;
  row: number;
  qty: number;
}

export const useUIStore = create((set) => ({
  loggedIn: false,
  setLoggedIn: () => set(() => ({ loggedIn: true })),
}));

export const useGameIdStore = create((set) => ({
  gameId: 0,
  setGameId: (gameId: number) => set(() => ({ gameId })),
}));

export const useBuilderIdStore = create((set) => ({
  builderId: 0,
  setBuilderId: (builderId: number) => set(() => ({ builderId })),
}));

export const useOrientationStore = create((set) => ({
  orientation: 1,
  setOrientation: (orientation: number) => set(() => ({ orientation })),
}));

export const useOrderStore = create((set) => ({
  order: 1,
  setOrder: (order: number) => set(() => ({ order })),
}));

export const useCharacterStore = create((set) => ({
  character: 0,
  setCharacter: (character: number) => set(() => ({ character })),
}));

export const useXStore = create((set) => ({
  x: 0,
  setX: (x: number) => set(() => ({ x })),
}));

export const useYStore = create((set) => ({
  y: 0,
  setY: (y: number) => set(() => ({ y })),
}));

interface MoveState {
  moves: Record<number, Array<Move>>;
  setMoves: (moves: Record<number, Array<Move>>) => void;
  setMoveByDay: (dayKey: number, move: Move) => void;
  loadMovesByDay: (dayKey: number) => Move[];
  findSquadByCoordinates: (day: number, x: number, y: number) => Move | null;
  clearByDay: (dayKey: number) => void;
  clearByDayUUID: (dayKey: number, uuid: string) => void;
  move: Move;
  selectedHex: Hex | null;
  moveToHex: Hex | null;
  setMoveToHex: (hex: Hex) => void;
  setSelectedHex: (hex: Hex) => void;
  isSelectedHex: (hex: Hex) => boolean;
  setMove: (move: Move) => void;
  clearMove: () => void;
};

export const useMoveStore = create<MoveState>()(
  persist(
    (set, get) => ({
      moves: {},
      setMoves: (moves) => set({ moves }),
      setMoveByDay: (dayKey, move) => {
        const { moves } = get();

        if (!moves[dayKey]) {
          moves[dayKey] = [];
        }
        const uuids = uuid();
        const existingMove = moves[dayKey].find((a) => a.uuid === move.uuid);

        if (existingMove) {
          const index = moves[dayKey].indexOf(existingMove);
          moves[dayKey].splice(index, 1);
          moves[dayKey].push({ ...move, uuid: existingMove.uuid });
        } else {
          moves[dayKey].push({ ...move, uuid: uuids });
        }

        set({ moves: { ...moves } });
      },
      loadMovesByDay: (dayKey) => {
        const { moves } = get();
        if (moves[dayKey]) {
          return moves[dayKey];
        }
        return [];
      },
      findSquadByCoordinates: (day, x, y) => {
        const { loadMovesByDay } = get();
        const dayMoves = loadMovesByDay(day);

        if (!dayMoves) {
          return null;
        }

        // // Iterate over the array of moves for the day
        for (const move of dayMoves) {
          if (move.x === x && move.y === y) {
            return move;
          }
        }
        return null;
      },
      clearByDay: (dayKey) => {
        const { moves } = get();
        if (moves[dayKey]) {
          const { [dayKey]: omitted, ...newMoves } = moves;
          set({ moves: newMoves });
        }
      },
      clearByDayUUID: (dayKey, uuid) => {
        const { moves } = get();
        if (moves[dayKey]) {
          const newDayMoves = moves[dayKey].filter(
            (move) => move.uuid !== uuid
          );
          set({ moves: { ...moves, [dayKey]: newDayMoves } });
        }
      },
      move: {
        squadId: 0,
        x: 0,
        y: 0,
        qty: 0,
        hash: "",
        timestamp: Date.now(),
        committed: false,
        revealed: false,
        uuid: "",
      },
      selectedHex: null,
      moveToHex: null,
      setMoveToHex: (moveToHex) => set({ moveToHex }),
      setSelectedHex: (selectedHex) => {
        set({ selectedHex });
      },
      isSelectedHex: (hex) => {
        const { selectedHex } = get();

        if (!selectedHex) {
          return false;
        }
        return selectedHex.col === hex.col && selectedHex.row === hex.row;
      },
      setMove: (move) => set({ move }),
      clearMove: () =>
        set({
          move: {
            squadId: 0,
            x: 0,
            y: 0,
            qty: 0,
            hash: "",
            timestamp: Date.now(),
            committed: false,
            revealed: false,
            uuid: "",
          },
        }),
    }),
    {
      name: "move-storage", // name of the item in the storage (must be unique)
    }
  )
);
