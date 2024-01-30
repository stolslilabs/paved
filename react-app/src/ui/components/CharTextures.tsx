import { useDojo } from "@/dojo/useDojo";
import { useEntityQuery } from "@dojoengine/react";
import { Has, HasValue } from "@dojoengine/recs";
import { CharTexture } from "./CharTexture";
import { useQueryParams } from "../../hooks/useQueryParams";

export const CharTextures = ({ radius, height, squareSize }: { radius: number, height: number, squareSize: number }) => {
  const { gameId } = useQueryParams();

  const {
    setup: {
      clientComponents: { Character },
    },
  } = useDojo();

  const characterEntities = useEntityQuery([
    Has(Character),
    HasValue(Character, { game_id: gameId }),
  ]);

  return (
    <>
      {characterEntities.map((character) => {
        return (
          <CharTexture
            key={character}
            entity={character}
            radius={radius}
            height={height}
            size={squareSize}
          />
        );
      })}
    </>
  );
};
