import * as THREE from "three";
import { useMemo, useRef, useState, useEffect } from "react";
import { useGameStore } from "../../store";
import { getImage, offset, other_offset } from "../../utils";
import { createSquareGeometry, getSquarePosition, loader } from "./TileTexture";

export const TileEmpty = ({ col, row, size, activeTile }: any) => {
  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);
  const meshRef = useRef<any>();

  const [background, setBackground] = useState<null | string>(null);
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);
  const [rotation, setRotation] = useState(0);
  const [hovered, setHovered] = useState(false);

  const {
    orientation,
    selectedTile,
    setSelectedTile,
    hoveredTile,
    setHoveredTile,
    setX,
    setY,
  } = useGameStore();

  const isSelected = useMemo(() => {
    return selectedTile && selectedTile.col === col && selectedTile.row === row;
  }, [selectedTile]);

  const isHovered = useMemo(() => {
    return hoveredTile && hoveredTile.col === col && hoveredTile.row === row;
  }, [hoveredTile]);

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
  }, [background, rotation, orientation]);

  useEffect(() => {
    if (activeTile && isSelected) {
      setBackground(getImage(activeTile));
      setRotation(calculateRotation(orientation));
    } else {
      setBackground(null);
    }
  }, [isSelected, orientation, activeTile]);

  useEffect(() => {
    if (isSelected) {
      setRotation(calculateRotation(orientation));
    }
  }, [isSelected, orientation]);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "auto";
  }, [hovered]);

  useEffect(() => {
    if (!isHovered) {
      handlePointerLeave();
    }
  }, [isHovered]);

  const handleMeshClick = () => {
    setSelectedTile({ col, row });
    setX(col);
    setY(row);
  };

  const handlePointerEnter = () => {
    setHovered(true);
    setHoveredTile({ col, row });
    if (activeTile) {
      setBackground(getImage(activeTile));
      setRotation(calculateRotation(orientation));
    } else {
      setBackground(null);
    }
  };

  const handlePointerLeave = () => {
    setHovered(false);
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
      {texture && (
        <mesh
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onClick={handleMeshClick}
          ref={meshRef}
          position={[position.x, position.y, 0]}
          geometry={squareGeometry}
        >
          <meshStandardMaterial
            emissive={"#FFFFFF"}
            emissiveIntensity={0.1}
            map={texture}
          />
        </mesh>
      )}
      {!texture && (
        <mesh
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onClick={handleMeshClick}
          ref={meshRef}
          position={[position.x, position.y, 0]}
          geometry={squareGeometry}
        >
          <meshStandardMaterial
            color={"#ADD8E6"}
            transparent={true}
            opacity={0.3}
          />
        </mesh>
      )}
    </>
  );
};

const calculateRotation = (orientation: any) =>
  (Math.PI / 2) * (1 - orientation);
