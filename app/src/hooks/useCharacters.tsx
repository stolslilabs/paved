import { useEffect, useMemo, useState } from "react";
import { useDojo } from "@/dojo/useDojo";
import {
  defineEnterSystem,
  defineSystem,
  Has,
  HasValue,
  NotValue,
} from "@dojoengine/recs";
import { useQueryParams } from "@/hooks/useQueryParams";

export const useCharacters = () => {
  const { gameId } = useQueryParams();
  const [characters, setCharacters] = useState<any>({});

  const {
    setup: {
      world,
      clientModels: {
        models: { Character },
      },
    },
  } = useDojo();

  const createCharacterAndSet = (character: any) => {
    // Update the characters
    setCharacters((prevCharacters: any) => {
      if (!character) return prevCharacters;
      // Remove character from the list if it's tile_id is 0
      const characterKey = `${character.gameId}-${character.player_id}-${character.index}`;
      if (!character.tile_id && prevCharacters[characterKey]) {
        delete prevCharacters[characterKey];
        return { ...prevCharacters };
      }
      return { ...prevCharacters, [characterKey]: character };
    });
  };

  useEffect(() => {
    defineEnterSystem(
      world,
      [
        Has(Character),
        HasValue(Character, { game_id: gameId }),
        NotValue(Character, { tile_id: 0 }),
      ],
      ({ value: [character] }: any) => {
        createCharacterAndSet(character);
      },
    );
    defineSystem(
      world,
      [
        Has(Character),
        HasValue(Character, { game_id: gameId }),
        NotValue(Character, { tile_id: 0 }),
      ],
      ({ value: [character] }: any) => {
        createCharacterAndSet(character);
      },
    );
  }, []);

  return { characters };
};
