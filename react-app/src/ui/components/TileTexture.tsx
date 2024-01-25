import * as THREE from "three";
import { useDojo } from "@/dojo/useDojo";
import { useGameStore } from "@/store";
import { getImage, offset, other_offset } from "@/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { loader } from "./TileBackground";

export const createSquareGeometry = (size: any) => {
  return new THREE.BoxGeometry(size, size, 0.1);
};

export const TileTexture = ({ entity, size }: any) => {
  const {
    account: { account },
    setup: {
      clientComponents: { Builder, Tile },
    },
  } = useDojo();
  const meshRef = useRef<any>();
  const [backgroundImage, setBackgroundImage] = useState(getImage(0));
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);
  const [rotation, setRotation] = useState(1);

  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);

  const tile = useComponentValue(Tile, entity);

  useEffect(() => {
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
    }
  }, [tile]);

  const position = useMemo(() => {
    return getSquarePosition({
      row: tile ? tile?.y - offset + other_offset : 0,
      col: tile ? tile?.x - offset + other_offset : 0,
      squareSize: 3,
    });
  }, [tile]);

  return (
    <>
      <mesh
        ref={meshRef}
        position={[position.x, position.y, 0.01]}
        geometry={squareGeometry}
      >
        <meshStandardMaterial map={texture} transparent={true} opacity={1} />
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
