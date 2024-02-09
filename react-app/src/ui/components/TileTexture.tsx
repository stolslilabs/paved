import * as THREE from "three";
import { useDojo } from "@/dojo/useDojo";
import { getImage, offset, other_offset } from "@/utils";
import { useEffect, useMemo, useRef, useState } from "react";

export const loader = new THREE.TextureLoader();

export const createSquareGeometry = (size: any) => {
  return new THREE.BoxGeometry(size, size, 0.1);
};

export const TileTexture = ({ tile, size }: any) => {
  const {
    setup: {
      clientComponents: { Tile },
    },
  } = useDojo();
  const meshRef = useRef<any>();
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);

  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);

  useEffect(() => {
    if (tile) {
      const rotation = (Math.PI / 2) * (1 - tile.orientation);
      const image = getImage(tile);
      loader.load(image, (loadedTexture) => {
        loadedTexture.center.set(0.5, 0.5);
        loadedTexture.rotation = rotation;
        setTexture(loadedTexture);
      });
    } else {
      setTexture(undefined);
    }
  }, [tile]);

  const position = useMemo(() => {
    const position = getSquarePosition({
      row: tile ? tile?.y - offset + other_offset : 0,
      col: tile ? tile?.x - offset + other_offset : 0,
      squareSize: size,
    });
    return position;
  }, [tile]);

  return (
    <>
      {texture && (
        <mesh
          ref={meshRef}
          position={[position.x, position.y, 0]}
          geometry={squareGeometry}
        >
          <meshStandardMaterial map={texture} transparent={true} opacity={1} />
        </mesh>
      )}
    </>
  );
};

export const getSquarePosition = ({
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
