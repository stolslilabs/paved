import { memo, useMemo } from "react";
import { TileTexture } from "./TileTexture";
import { TileEmpty } from "./TileEmpty";
import { useTiles } from "@/hooks/useTiles";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useGame } from "@/hooks/useGame";
import { ModeType } from "@/dojo/game/types/mode";

export const TileTextures = memo(({ squareSize }: { squareSize: number }) => {
  const gameId = useQueryParams();
  const { game } = useGame(gameId);
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
            isTutorial={game?.mode.value === ModeType.Tutorial}
          />
        );
      } else {
        return (
          <TileTexture
            key={index}
            tile={item.tile}
            size={squareSize}
            length={findHighestId(tiles)}
            isTutorial={game?.mode.value === ModeType.Tutorial}
          />
        );
      }
    });
  }, [items, squareSize]);

  return <>{renderedItems}</>;
})
