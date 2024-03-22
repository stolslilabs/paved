import * as THREE from "three";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useGameStore } from "@/store";
import { offset, other_offset } from "@/dojo/game";
import { checkCompatibility } from "@/dojo/game/types/layout";
import { createSquareGeometry, getSquarePosition } from "./TileTexture";
import { useQueryParams } from "@/hooks/useQueryParams";
import { checkFeatureIdle } from "@/dojo/game/helpers/conflict";
import useSound from "use-sound";

import Click from "/sounds/click.wav";
import { useTileByKey } from "@/hooks/useTile";
import { useTiles } from "@/hooks/useTiles";

const loader = new THREE.TextureLoader();

export const TileEmpty = ({ col, row, size }: any) => {
  const [play, { stop }] = useSound(Click);
  const { tiles } = useTiles();
  const { gameId } = useQueryParams();

  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);
  const meshRef = useRef<any>();
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);
  const [hovered, setHovered] = useState(false);

  const {
    orientation,
    spot,
    selectedTile,
    setSelectedTile,
    activeEntity,
    hoveredTile,
    setHoveredTile,
    setX,
    setY,
    setValid,
  } = useGameStore();

  const { tile: activeTile } = useTileByKey({ tileKey: activeEntity });

  const { northTile, eastTile, southTile, westTile } = useMemo(() => {
    return {
      northTile: tiles[`${gameId}-${col}-${row + 1}`],
      eastTile: tiles[`${gameId}-${col + 1}-${row}`],
      southTile: tiles[`${gameId}-${col}-${row - 1}`],
      westTile: tiles[`${gameId}-${col - 1}-${row}`],
    };
  }, [gameId, tiles]);

  const isValid = useMemo(() => {
    const isSelected =
      selectedTile && selectedTile.col === col && selectedTile.row === row;
    const isHovered =
      hovered &&
      hoveredTile &&
      hoveredTile.col === col &&
      hoveredTile.row === row;
    return (
      activeTile &&
      (isHovered || isSelected) &&
      orientation &&
      checkCompatibility(
        activeTile,
        orientation,
        northTile,
        eastTile,
        southTile,
        westTile
      )
    );
  }, [
    activeTile,
    hoveredTile,
    selectedTile,
    orientation,
    northTile,
    eastTile,
    southTile,
    westTile,
    hovered,
  ]);

  const isIdle = useMemo(() => {
    const isSelected =
      selectedTile && selectedTile.col === col && selectedTile.row === row;
    const isHovered =
      hovered &&
      hoveredTile &&
      hoveredTile.col === col &&
      hoveredTile.row === row;
    return (
      activeTile &&
      (isHovered || isSelected) &&
      orientation &&
      checkFeatureIdle(gameId, activeTile, orientation, col, row, spot, tiles)
    );
  }, [activeTile, hoveredTile, selectedTile, orientation, spot, hovered]);

  useEffect(() => {
    let rotation = 0;
    let background = null;

    // Tile is has been selected or hovered, setup the texture and validity
    const isSelected =
      selectedTile && selectedTile.col === col && selectedTile.row === row;
    const isHovered =
      hovered &&
      hoveredTile &&
      hoveredTile.col === col &&
      hoveredTile.row === row;
    if (activeTile && (isSelected || isHovered)) {
      background = activeTile.getImage();
      rotation = calculateRotation(orientation);
      if (activeTile && isSelected) {
        setValid((isValid && isIdle) || false);
      }
    }

    // Finally, update the texture
    if (background) {
      loader.load(background, (loadedTexture) => {
        loadedTexture.center.set(0.5, 0.5);
        loadedTexture.rotation = rotation;
        setTexture(loadedTexture);
      });
    } else {
      setTexture(undefined);
    }
  }, [
    selectedTile,
    orientation,
    activeTile,
    isValid,
    isIdle,
    hoveredTile,
    hovered,
  ]);

  useMemo(() => {
    const isHovered =
      hoveredTile && hoveredTile.col === col && hoveredTile.row === row;
    document.body.style.cursor = isHovered ? "pointer" : "auto";
  }, [hoveredTile]);

  const handleSimpleClick = useCallback(() => {
    play();
    setSelectedTile({ col, row });
    setX(col);
    setY(row);
  }, []);

  const handlePointerEnter = useCallback(() => {
    setHovered(true);
    setHoveredTile({ col, row });
  }, []);

  const handlePointerLeave = useCallback(() => {
    setHovered(false);
  }, []);

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
          onClick={handleSimpleClick}
          ref={meshRef}
          position={[position.x, position.y, 0]}
          geometry={squareGeometry}
        >
          <meshStandardMaterial attach="material-0" color={"#503A23"} />
          <meshStandardMaterial attach="material-1" color={"#503A23"} />
          <meshStandardMaterial attach="material-2" color={"#503A23"} />
          <meshStandardMaterial attach="material-3" color={"#503A23"} />
          <meshStandardMaterial
            attach="material-4"
            emissive={isValid ? (isIdle ? "green" : "red") : "orange"}
            emissiveIntensity={isValid ? (isIdle ? 0.5 : 0.2) : 0.4}
            map={texture}
          />
          <meshStandardMaterial attach="material-5" color={"#503A23"} />
        </mesh>
      )}
      {!texture && (
        <mesh
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onClick={handleSimpleClick}
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
