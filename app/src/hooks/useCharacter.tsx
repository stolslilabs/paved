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
  gameId: number | undefined;
  playerId: string | undefined;
  characterId: number | undefined;
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
        BigInt(gameId || 0),
        BigInt(playerId || 0),
        BigInt(characterId || 0),
      ]) as Entity,
    [gameId, playerId, characterId],
  );
  const character = useComponentValue(Character, characterKey);

  return { character, characterKey };
};
