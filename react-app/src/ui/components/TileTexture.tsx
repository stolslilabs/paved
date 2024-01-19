import * as THREE from "three";
import { useDojo } from "@/dojo/useDojo";
import { useGameStore } from "@/store";
import { getImage } from "@/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useEffect, useMemo, useRef, useState } from "react";

export const createSquareGeometry = (size: any) => {
  return new THREE.BoxGeometry(size, size, 0.1);
};

// we can replicate the position of the image, without having to loop through the tiles
export const TileTexture = ({ entity, size }: any) => {
  const {
    account: { account },
    setup: {
      clientComponents: { Builder, Tile },
    },
  } = useDojo();

  const { gameId, orientation } = useGameStore();

  const tile = useComponentValue(Tile, entity);

  const builder = useComponentValue(
    Builder,
    getEntityIdFromKeys([BigInt(gameId), BigInt(account.address)]) as Entity
  );

  const activeTile = useComponentValue(
    Tile,
    getEntityIdFromKeys([
      BigInt(gameId),
      BigInt(builder ? builder.tile_id : 0),
    ]) as Entity
  );

  const meshRef = useRef<any>();

  const [backgroundImage, setBackgroundImage] = useState(getImage(0));
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);
  const [opacity, setOpacity] = useState(1);
  const [rotation, setRotation] = useState(1);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(backgroundImage, (loadedTexture) => {
      loadedTexture.center.set(0.5, 0.5);
      loadedTexture.rotation = rotation;
      setTexture(loadedTexture);
    });
  }, [backgroundImage, rotation]);

  useEffect(() => {
    if (tile) {
      setBackgroundImage(getImage(tile));
      setRotation((Math.PI / 2) * (1 - tile.orientation));
      setOpacity(1);
    }
  }, [tile, activeTile, orientation]);

  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);

  const offset = 0x7fffffff;

  const other_offset = Math.floor(30 / 2);

  const position = useMemo(() => {
    return getSquarePosition({
      row: tile ? tile?.y - offset + other_offset : 0,
      col: tile ? tile?.x - offset + other_offset : 0,
      squareSize: 3,
    });
  }, []);

  return (
    <>
      <mesh
        ref={meshRef}
        position={[position.x, position.y, 0]}
        geometry={squareGeometry}
      >
        {texture && (
          <meshStandardMaterial
            map={texture}
            transparent={true}
            opacity={opacity}
          />
        )}
      </mesh>
    </>
  );
};

const getSquarePosition = ({
  row,
  col,
  squareSize,
}: {
  row: number;
  col: number;
  squareSize: number;
}) => {
  const x = col * squareSize;
  const y = row * squareSize;

  return { x, y };
};
