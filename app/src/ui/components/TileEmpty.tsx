import * as THREE from "three";
import { useDojo } from "@/dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";
import { useMemo, useRef, useState, useEffect } from "react";
import { useGameStore } from "@/store";
import { getImage, offset, other_offset } from "@/utils";
import { checkCompatibility } from "@/utils/layout";
import { createSquareGeometry, getSquarePosition } from "./TileTexture";
import { useQueryParams } from "@/hooks/useQueryParams";
import {
  defineEnterSystem,
  defineSystem,
  Has,
  HasValue,
} from "@dojoengine/recs";
import { RawTile } from "@/utils/models/tile";
import { checkFeatureIdle } from "@/utils/helpers/conflict";
import useSound from "use-sound";

import Click from "../../../public/click.wav";

const loader = new THREE.TextureLoader();

export const TileEmpty = ({ col, row, size, tiles }: any) => {
  const [play, { stop }] = useSound(Click);

  const { gameId } = useQueryParams();
  const {
    setup: {
      world,
      clientComponents: { Tile },
    },
  } = useDojo();

  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);
  const meshRef = useRef<any>();
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);
  const [hovered, setHovered] = useState(false);
  const [northTile, setNorthTile] = useState<Entity | undefined>();
  const [eastTile, setEastTile] = useState<Entity | undefined>();
  const [southTile, setSouthTile] = useState<Entity | undefined>();
  const [westTile, setWestTile] = useState<Entity | undefined>();

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

  const activeTile = useComponentValue(Tile, activeEntity);

  useMemo(() => {
    defineEnterSystem(
      world,
      [Has(Tile), HasValue(Tile, { game_id: gameId, x: col, y: row + 1 })],
      ({ value: [tile] }: any) => {
        if (tile.orientation === 0 || tile.x !== col || tile.y !== row + 1)
          return;
        setNorthTile(tile);
      }
    );
    defineSystem(
      world,
      [Has(Tile), HasValue(Tile, { game_id: gameId, x: col, y: row + 1 })],
      ({ value: [tile] }: any) => {
        if (tile.orientation === 0 || tile.x !== col || tile.y !== row + 1)
          return;
        setNorthTile(tile);
      }
    );
    defineEnterSystem(
      world,
      [Has(Tile), HasValue(Tile, { game_id: gameId, x: col + 1, y: row })],
      ({ value: [tile] }: any) => {
        if (tile.orientation === 0 || tile.x !== col + 1 || tile.y !== row)
          return;
        setEastTile(tile);
      }
    );
    defineSystem(
      world,
      [Has(Tile), HasValue(Tile, { game_id: gameId, x: col + 1, y: row })],
      ({ value: [tile] }: any) => {
        if (tile.orientation === 0 || tile.x !== col + 1 || tile.y !== row)
          return;
        setEastTile(tile);
      }
    );
    defineEnterSystem(
      world,
      [Has(Tile), HasValue(Tile, { game_id: gameId, x: col, y: row - 1 })],
      ({ value: [tile] }: any) => {
        if (tile.orientation === 0 || tile.x !== col || tile.y !== row - 1)
          return;
        setSouthTile(tile);
      }
    );
    defineSystem(
      world,
      [Has(Tile), HasValue(Tile, { game_id: gameId, x: col, y: row - 1 })],
      ({ value: [tile] }: any) => {
        if (tile.orientation === 0 || tile.x !== col || tile.y !== row - 1)
          return;
        setSouthTile(tile);
      }
    );
    defineEnterSystem(
      world,
      [Has(Tile), HasValue(Tile, { game_id: gameId, x: col - 1, y: row })],
      ({ value: [tile] }: any) => {
        if (tile.orientation === 0 || tile.x !== col - 1 || tile.y !== row)
          return;
        setWestTile(tile);
      }
    );
    defineSystem(
      world,
      [Has(Tile), HasValue(Tile, { game_id: gameId, x: col - 1, y: row })],
      ({ value: [tile] }: any) => {
        if (tile.orientation === 0 || tile.x !== col - 1 || tile.y !== row)
          return;
        setWestTile(tile);
      }
    );
  }, []);

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
        activeTile.plan,
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
      checkFeatureIdle(
        gameId,
        activeTile as RawTile,
        orientation,
        col,
        row,
        spot,
        tiles
      )
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
      background = getImage(activeTile);
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

  const handleSimpleClick = () => {
    play();
    setSelectedTile({ col, row });
    setX(col);
    setY(row);
  };

  const handlePointerEnter = () => {
    setHovered(true);
    setHoveredTile({ col, row });
  };

  const handlePointerLeave = () => {
    setHovered(false);
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
