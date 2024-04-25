import { useMemo } from "react";
import { CharTexture } from "./CharTexture";
import { useCharacters } from "@/hooks/useCharacters";

export const CharTextures = ({
  radius,
  height,
  squareSize,
}: {
  radius: number;
  height: number;
  squareSize: number;
}) => {
  const { characters } = useCharacters();

  const renderedItems = useMemo(() => {
    return Object.keys(characters).map((key: string) => {
      const character = characters[key];
      return (
        <CharTexture
          key={key}
          character={character}
          radius={radius}
          height={height}
          size={squareSize}
        />
      );
    });
  }, [characters, radius, height, squareSize]);

  return <>{renderedItems}</>;
};
