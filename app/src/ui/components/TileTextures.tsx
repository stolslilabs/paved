import { useMemo } from "react";
import { TileTexture } from "./TileTexture";
import { TileEmpty } from "./TileEmpty";
import { useTiles } from "@/hooks/useTiles";

export const TileTextures = ({ squareSize }: { squareSize: number }) => {
  const { tiles, items } = useTiles();

  function findHighestId(obj: any) {
    let highestId = -Infinity; // Start with the smallest possible number
    Object.keys(obj).forEach((key) => {
      const currentId = obj[key].id;
      if (currentId > highestId) {
        highestId = currentId;
      }
    });
    return highestId;
  }

  const highestId = findHighestId(tiles);

  const renderedItems = useMemo(() => {
    return Object.keys(items).map((key: string, index) => {
      const item = items[key];
      if (item.empty) {
        return (
          <TileEmpty
            key={index}
            tiles={tiles}
            col={item.tile.col}
            row={item.tile.row}
            size={squareSize}
          />
        );
      } else {
        return (
          <TileTexture
            key={index}
            tile={item.tile}
            size={squareSize}
            length={findHighestId(tiles)}
          />
        );
      }
    });
  }, [items, squareSize]);

  return <>{renderedItems}</>;
};
