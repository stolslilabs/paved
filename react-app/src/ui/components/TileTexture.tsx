import * as THREE from "three";
import { useDojo } from "@/dojo/useDojo";
import { getImage, offset, other_offset } from "@/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { TileEmpty } from "./TileEmpty";

export const loader = new THREE.TextureLoader();

export const createSquareGeometry = (size: any) => {
  return new THREE.BoxGeometry(size, size, 0.1);
};

export const TileTexture = ({
  entity,
  size,
  tilePositionEntities,
  onTileClick,
  selectedTile,
  activeTile,
}: any) => {
  const {
    setup: {
      clientComponents: { Tile },
    },
  } = useDojo();
  const meshRef = useRef<any>();
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);

  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);

  const tile = useComponentValue(Tile, entity);

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

  const neighborsOffsets = [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
  ];

  const extraPositions = useMemo(() => {
    if (!tile) return [];

    const positions: {
      col: number;
      row: number;
    }[] = [];

    neighborsOffsets.forEach((neighborOffset) => {
      const neighborCol = tile.x + neighborOffset.x;
      const neighborRow = tile.y + neighborOffset.y;
      const neighborEntityId = getEntityIdFromKeys([
        BigInt(tile.game_id),
        BigInt(neighborCol),
        BigInt(neighborRow),
      ]) as Entity;

      if (!tilePositionEntities.includes(neighborEntityId)) {
        const position = {
          col: neighborCol,
          row: neighborRow,
        };
        positions.push(position);
      }
    });
    return positions;
  }, [tile, tilePositionEntities]);

  return (
    <>
      {texture && (
        <mesh
          ref={meshRef}
          position={[position.x, position.y, 0.01]}
          geometry={squareGeometry}
        >
          <meshStandardMaterial map={texture} transparent={true} opacity={1} />
        </mesh>
      )}
      {extraPositions.map((position) => {
        return (
          <TileEmpty
            key={`empty-${position.col}-${position.row}`}
            col={position.col}
            row={position.row}
            size={3}
            onTileClick={onTileClick}
            selectedTile={selectedTile}
            activeTile={activeTile}
          />
        );
      })}
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
