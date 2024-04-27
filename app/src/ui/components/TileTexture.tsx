import * as THREE from "three";
import { offset, other_offset } from "@/dojo/game";
import { useMemo, useRef, useState } from "react";
import { useGameStore } from "@/store";

export const loader = new THREE.TextureLoader();

export const createSquareGeometry = (size: any) => {
  return new THREE.BoxGeometry(size, size, 0.1);
};

export const TileTexture = ({ tile, size }: any) => {
  const meshRef = useRef<any>();
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);
  const { setHoveredTile } = useGameStore();

  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);
  const position = useMemo(() => {
    const row = tile ? tile.y - offset + other_offset : 0;
    const col = tile ? tile.x - offset + other_offset : 0;
    return getSquarePosition({ row, col, squareSize: size });
  }, [tile, size]);

  useMemo(() => {
    if (tile) {
      const rotation = (Math.PI / 2) * (1 - tile.orientation.into());
      const image = tile.getImage();
      loader.load(image, (loadedTexture) => {
        loadedTexture.center.set(0.5, 0.5);
        loadedTexture.rotation = rotation;
        setTexture(loadedTexture);
      });
    } else {
      setTexture(undefined);
    }
  }, [tile]);

  const handlePointerEnter = () => {
    const col = tile ? tile?.y - offset + other_offset : 0;
    const row = tile ? tile?.x - offset + other_offset : 0;
    setHoveredTile({ col, row });
  };

  return (
    <mesh
      visible={texture !== undefined}
      ref={meshRef}
      onPointerEnter={handlePointerEnter}
      position={[position.x, position.y, 0]}
      geometry={squareGeometry}
    >
      <meshStandardMaterial attach="material-0" color={"#503A23"} />
      <meshStandardMaterial attach="material-1" color={"#503A23"} />
      <meshStandardMaterial attach="material-2" color={"#503A23"} />
      <meshStandardMaterial attach="material-3" color={"#503A23"} />
      <meshStandardMaterial attach="material-4" map={texture} />
      <meshStandardMaterial attach="material-5" color={"#503A23"} />
    </mesh>
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
