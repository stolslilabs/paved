import { useDojo } from "@/dojo/useDojo";
import { useMemo } from "react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";
import { Character } from "@/dojo/game/models/character";

export const useCharacter = ({
  gameId,
  playerId,
  characterId,
}: {
  gameId: number | undefined;
  playerId: string | undefined;
  characterId: number | undefined;
}): { character: Character | null; characterKey: Entity } => {
  const {
    setup: {
      clientModels: {
        models: { Character },
        classes: { Character: CharacterClass },
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

  const component = useComponentValue(Character, characterKey);
  const character = useMemo(() => {
    return component ? new CharacterClass(component) : null;
  }, [component]);

  return { character, characterKey };
};
