import { useDojo } from "@/dojo/useDojo";
import { useMemo } from "react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";

export const useCharacter = ({
  gameId,
  playerId,
  characterId,
}: {
  gameId: number;
  playerId: string;
  characterId: number;
}) => {
  const {
    setup: {
      clientModels: {
        models: { Character },
      },
    },
  } = useDojo();

  const characterKey = useMemo(
    () =>
      getEntityIdFromKeys([
        BigInt(gameId),
        BigInt(playerId),
        BigInt(characterId),
      ]) as Entity,
    [gameId, playerId, characterId],
  );
  const character = useComponentValue(Character, characterKey);

  return { character, characterKey };
};
