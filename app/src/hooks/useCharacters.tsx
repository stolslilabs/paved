import { useEffect, useState } from "react";
import { useDojo } from "@/dojo/useDojo";
import { getComponentValue, Has, HasValue, NotValue } from "@dojoengine/recs";
import { useEntityQuery } from "@dojoengine/react";
import { Character } from "@/dojo/game/models/character";

export const useCharacters = ({
  gameId,
}: {
  gameId: number;
}): { characters: Character[] } => {
  const [characters, setCharacters] = useState<any>({});

  const {
    setup: {
      clientModels: {
        models: { Character },
        classes: { Character: CharacterClass },
      },
    },
  } = useDojo();

  const characterKeys = useEntityQuery([
    Has(Character),
    HasValue(Character, { game_id: gameId }),
    NotValue(Character, { tile_id: 0 }),
  ]);

  useEffect(() => {
    const components = characterKeys.map((entity) => {
      const component = getComponentValue(Character, entity);
      if (!component) {
        return undefined;
      }
      return new CharacterClass(component);
    });

    const objectified = components.reduce(
      (obj: any, character: Character | undefined) => {
        if (character) {
          obj[character.index] = character;
        }
        return obj;
      },
      {},
    );

    setCharacters(objectified);
  }, [characterKeys]);

  return { characters: Object.values(characters) };
};
