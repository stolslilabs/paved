import { useDojo } from "@/dojo/useDojo";
import { useEntityQuery } from "@dojoengine/react";
import { Has, NotValue } from "@dojoengine/recs";
import { TileTexture } from "./TileTexture";

export const TileTextures = ({ squareSize }: { squareSize: number }) => {
  const {
    setup: {
      clientComponents: { Tile },
    },
  } = useDojo();

  const tileEntities = useEntityQuery([
    Has(Tile),
    NotValue(Tile, { orientation: 0 }),
  ]);

  console.log(tileEntities);

  return (
    <>
      {tileEntities.map((tile) => {
        return <TileTexture key={tile} entity={tile} size={squareSize} />;
      })}
    </>
  );
};
