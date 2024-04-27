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

const loader = new THREE.TextureLoader();

export const TileEmpty = ({ tiles, col, row, size }: any) => {
  const [play, { stop }] = useSound(Click);
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

  const isSelected = useMemo(() => {
    return selectedTile && selectedTile.col === col && selectedTile.row === row;
  }, [selectedTile, col, row]);

  const isHovered = useMemo(() => {
    return (
      hovered &&
      hoveredTile &&
      hoveredTile.col === col &&
      hoveredTile.row === row
    );
  }, [hovered, hoveredTile, col, row]);

  const isValid = useMemo(() => {
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
        westTile,
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
    isHovered,
    isSelected,
  ]);

  const isIdle = useMemo(() => {
    return (
      activeTile &&
      (isHovered || isSelected) &&
      orientation &&
      checkFeatureIdle(gameId, activeTile, orientation, col, row, spot, tiles)
    );
  }, [activeTile, hoveredTile, selectedTile, orientation, spot, hovered]);

  const shouldUpdateTexture = useMemo(() => {
    return activeTile && (isSelected || isHovered);
  }, [activeTile, isSelected, isHovered]);

  useEffect(() => {
    if (!shouldUpdateTexture) {
      setTexture(undefined);
      return;
    }

    const background = activeTile?.getImage();
    const rotation = calculateRotation(orientation);

    updateTexture(background, rotation);

    if (isSelected) {
      setValid((isValid && isIdle) || false);
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

  const updateTexture = (background: any, rotation: any) => {
    loader.load(background, (loadedTexture) => {
      loadedTexture.center.set(0.5, 0.5);
      loadedTexture.rotation = rotation;
      setTexture(loadedTexture);
    });
  };

  useMemo(() => {
    document.body.style.cursor = isHovered ? "pointer" : "auto";
  }, [hoveredTile, isHovered]);

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

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ADD8E6",
        transparent: true,
        opacity: 0.3,
      }),
    [],
  );

  const meshComponent = useMemo(
    () => (
      <mesh
        visible={texture !== undefined}
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
    ),
    [
      texture,
      isValid,
      isIdle,
      position.x,
      position.y,
      squareGeometry,
      handlePointerEnter,
      handlePointerLeave,
      handleSimpleClick,
    ],
  );

  return (
    <>
      {meshComponent}

      <mesh
        visible={!texture}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={handleSimpleClick}
        ref={meshRef}
        position={[position.x, position.y, 0]}
        geometry={squareGeometry}
      >
        <mesh material={mat} />
      </mesh>
    </>
  );
};

const calculateRotation = (orientation: any) =>
  (Math.PI / 2) * (1 - orientation);
