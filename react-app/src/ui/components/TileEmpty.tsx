import * as THREE from "three";
import { useMemo, useRef, useState, useEffect } from "react";
import { useGameStore } from "../../store";
import { getImage, offset, other_offset } from "../../utils";
import { createSquareGeometry, getSquarePosition, loader } from "./TileTexture";

export const TileEmpty = ({
  col,
  row,
  size,
  onTileClick,
  selectedTile,
  activeTile,
}: any) => {
  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);
  const meshRef = useRef<any>();

  const [background, setBackground] = useState<null | string>(null);
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);
  const [rotation, setRotation] = useState(0);

  const { orientation } = useGameStore();

  const isSelected = useMemo(() => {
    return selectedTile && selectedTile.col === col && selectedTile.row === row;
  }, [selectedTile, col, row]);

  useEffect(() => {
    if (background) {
      loader.load(background, (loadedTexture) => {
        loadedTexture.center.set(0.5, 0.5);
        loadedTexture.rotation = rotation;
        setTexture(loadedTexture);
      });
    } else {
      setTexture(undefined);
    }
  }, [background, rotation, isSelected]);

  useEffect(() => {
    if (activeTile && isSelected) {
      setBackground(getImage(activeTile));
      setRotation(calculateRotation(orientation));
    } else {
      setBackground(null);
    }
  }, [isSelected]);

  useEffect(() => {
    if (isSelected) {
      setRotation(calculateRotation(orientation));
    }
  }, [isSelected, orientation]);

  const handleMeshClick = () => {
    onTileClick(col, row);
  };

  const handlePointerEnter = () => {
    if (activeTile) {
      setBackground(getImage(activeTile));
      setRotation(calculateRotation(orientation));
    } else {
      setBackground(null);
    }
  };

  const handlePointerLeave = () => {
    if (isSelected && activeTile) {
      const image = getImage(activeTile);
      setBackground(image);
    } else {
      setBackground(null);
    }
  };

  const position = useMemo(() => {
    const position = getSquarePosition({
      row: row - offset + other_offset,
      col: col - offset + other_offset,
      squareSize: 3,
    });
    return position;
  }, []);

  return (
    <>
      <mesh
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={handleMeshClick}
        ref={meshRef}
        position={[position.x, position.y, 0]}
        geometry={squareGeometry}
      >
        {texture && (
          <meshStandardMaterial map={texture} transparent={true} opacity={1} />
        )}
        {!texture && (
          <meshStandardMaterial
            color={"#ADD8E6"}
            transparent={true}
            opacity={1}
          />
        )}
      </mesh>
    </>
  );
};

const calculateRotation = (orientation: any) =>
  (Math.PI / 2) * (1 - orientation);
