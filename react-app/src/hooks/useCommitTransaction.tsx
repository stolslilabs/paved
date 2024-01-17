import { useMoveStore } from "@/store";
import { getContractByName } from "@dojoengine/core";
import { dojoConfig } from "../../dojoConfig";
import { Call } from "starknet";

export const useCommitTransaction = () => {
  const { manifest } = dojoConfig();
  const gameDay = 1;
  const loadMovesByDay = useMoveStore((state) => state.loadMovesByDay);

  const setMoveByDay = useMoveStore((state) => state.setMoveByDay);

  const movesCommitArray = (): Call[] => {
    return loadMovesByDay(gameDay).map((move) => {
      setMoveByDay(gameDay, { ...move, committed: true });
      return {
        entrypoint: "move_squad_commitment",
        contractAddress: getContractByName(manifest, "move"),
        calldata: [gameDay, move.squadId, move.hash],
      };
    });
  };

  const moveRevealArray = (): Call[] => {
    return loadMovesByDay(gameDay).map((move) => {
      setMoveByDay(gameDay, { ...move, revealed: true });
      return {
        entrypoint: "move_squad_reveal",
        contractAddress: getContractByName(manifest, "move"),
        calldata: [gameDay, move.squadId, move.qty, move.x, move.y],
      };
    });
  };

  return {
    movesCommitArray,
    moveRevealArray,
  };
};
