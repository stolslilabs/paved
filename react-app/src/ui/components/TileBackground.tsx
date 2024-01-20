import * as THREE from "three";
import { useMemo, useRef, useState, useEffect } from "react";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useGameStore } from "../../store";
import { getImage } from "../../utils";
import { useDojo } from "@/dojo/useDojo";
import { createSquareGeometry } from "./TileTexture";

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

  const meshRef = useRef<any>();

  const [backgroundImage, setBackgroundImage] = useState(getImage(0));
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);
  const [opacity, setOpacity] = useState(1);
  const [rotation, setRotation] = useState(1);

  const [zPosition, setZPosition] = useState(0);

  const { gameId, orientation, x, y, setX, setY } = useGameStore();

  const tilePosition = useComponentValue(
    TilePosition,
    getEntityIdFromKeys([
      BigInt(gameId),
      BigInt(col + 0x7fffffff),
      BigInt(row + 0x7fffffff),
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
    } else if (isSelected && activeTile) {
      setBackgroundImage(getImage(activeTile));
      setRotation((Math.PI / 2) * (1 - orientation));
      setOpacity(0.8);
    } else {
      setBackgroundImage(getImage(0));
      setRotation(0);
      setOpacity(1);
    }
  }, [tile, isSelected, activeTile, orientation]);

  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);

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
    setOpacity(1);
    setZPosition(0.01);
  };

  const calculateRotation = (orientation: any) =>
    (Math.PI / 2) * (1 - orientation);

  const handlePointerLeave = () => {
    let image, rotation;

    if (tile) {
      image = getImage(tile);
      rotation = calculateRotation(tile.orientation);
      setOpacity(1);
    } else if (isSelected && activeTile) {
      image = getImage(activeTile);
      rotation = calculateRotation(orientation);
      setOpacity(1);
    } else {
      rotation = 0;
      setOpacity(1);
      setBackgroundImage(getImage(0));
    }

    if (image) {
      setBackgroundImage(image);
    }
    setRotation(rotation);

    setZPosition(0);
  };

  return (
    <>
      <mesh
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={handleMeshClick}
        ref={meshRef}
        position={[position[0], position[1], zPosition]}
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
      <lineSegments
        geometry={new THREE.EdgesGeometry(squareGeometry)}
        material={
          new THREE.LineBasicMaterial({
            color: "gray",
            linewidth: 1,
          })
        }
        position={position}
      />
    </>
  );
};
