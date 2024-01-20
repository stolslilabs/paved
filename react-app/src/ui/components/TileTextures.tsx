import { useDojo } from "@/dojo/useDojo";
import { useEntityQuery } from "@dojoengine/react";
import { Has } from "@dojoengine/recs";
import { TileTexture } from "./TileTexture";

export const TileTextures = ({ squareSize }: { squareSize: number }) => {
  const {
    setup: {
      clientComponents: { Tile },
    },
  } = useDojo();

  const tileEntities = useEntityQuery([Has(Tile)]);

  return (
    <>
      {tileEntities.map((tile, index) => {
        return <TileTexture key={index} entity={tile} size={squareSize} />;
      })}
    </>
  );
};
