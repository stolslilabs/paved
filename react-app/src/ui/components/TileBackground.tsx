import * as THREE from "three";
import { useMemo, useRef, useState, useEffect } from "react";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useGameStore } from "../../store";
import { getImage, offset } from "../../utils";
import { useDojo } from "@/dojo/useDojo";
import { createSquareGeometry } from "./TileTexture";

export const loader = new THREE.TextureLoader();

export const TileBackground = ({
  position,
  size,
  col,
  row,
  onTileClick,
  selectedTile,
  activeTile,
}: any) => {
  const {
    setup: {
      clientComponents: { Tile, TilePosition },
    },
  } = useDojo();
  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);
  const meshRef = useRef<any>();

  const [backgroundImage, setBackgroundImage] = useState<null | string>(
    getImage(0)
  );
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);
  const [opacity, setOpacity] = useState(0);
  const [rotation, setRotation] = useState(1);

  const { gameId, orientation, setX, setY } = useGameStore();

  const tilePosition = useComponentValue(
    TilePosition,
    getEntityIdFromKeys([
      BigInt(gameId),
      BigInt(col + offset),
      BigInt(row + offset),
    ]) as Entity
  );

  const tile = useComponentValue(
    Tile,
    getEntityIdFromKeys([
      BigInt(tilePosition ? tilePosition.game_id : 0),
      BigInt(tilePosition ? tilePosition.tile_id : 0),
    ]) as Entity
  );

  const isSelected = useMemo(() => {
    return selectedTile && selectedTile.col === col && selectedTile.row === row;
  }, [selectedTile, col, row]);

  useEffect(() => {
    if (backgroundImage) {
      loader.load(backgroundImage, (loadedTexture) => {
        loadedTexture.center.set(0.5, 0.5);
        loadedTexture.rotation = rotation;
        setTexture(loadedTexture);
      });
    }
  }, [backgroundImage, rotation, isSelected]);

  useEffect(() => {
    if (!isSelected && !tile) {
      setOpacity(0);
      setBackgroundImage(null);
    }
  }, [isSelected, tile]);

  useEffect(() => {
    setRotation(calculateRotation(orientation));
  }, [orientation]);

  const handleMeshClick = () => {
    onTileClick(col, row);
    if (!tile) {
      setX(col);
      setY(row);
    }
  };

  const handlePointerEnter = () => {
    if (tile) return;
    if (activeTile && !tile) {
      setBackgroundImage(getImage(activeTile));
      setRotation(calculateRotation(orientation));
    } else {
      setBackgroundImage(getImage(1));
    }
    setOpacity(0.7);
  };

  const calculateRotation = (orientation: any) =>
    (Math.PI / 2) * (1 - orientation);

  const handlePointerLeave = () => {
    let image;

    if (tile) {
      setOpacity(1);
    } else if (isSelected && activeTile) {
      image = getImage(activeTile);
      setOpacity(1);
    } else {
      setOpacity(0);
      setBackgroundImage(null);
    }

    if (image) {
      setBackgroundImage(image);
    }
  };

  return (
    <>
      <mesh
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={handleMeshClick}
        ref={meshRef}
        position={[position[0], position[1], 0]}
        geometry={squareGeometry}
      >
        <meshStandardMaterial
          map={texture}
          transparent={true}
          opacity={opacity}
        />
      </mesh>
    </>
  );
};
