import * as THREE from "three";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useGameStore } from "@/store";
import { getImage, offset, other_offset } from "@/dojo/game";
import { checkCompatibility } from "@/dojo/game/types/layout";
import { createSquareGeometry, getSquarePosition } from "./TileTexture";
import { useQueryParams } from "@/hooks/useQueryParams";
import { checkFeatureIdle } from "@/dojo/game/helpers/conflict";
import useSound from "use-sound";

import Place from "/sounds/effects/p-place.m4a";
import { useTile, useTileByKey } from "@/hooks/useTile";
import { useActions } from "@/hooks/useActions";
import { Edges, Html, Plane, useTexture } from "@react-three/drei";
import { useTutorial } from "@/hooks/useTutorial";
import { useDojo } from "@/dojo/useDojo";
import { useBuilder } from "@/hooks/useBuilder";
import { TileEmptyComponent } from "./TileEmptyComponent";

const loader = new THREE.TextureLoader();

export const TileEmpty = ({ tiles, col, row, size, isTutorial }: any) => {
  const [play] = useSound(Place);

  const { gameId } = useQueryParams();
  const { enabled } = useActions();

  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);
  const meshRef = useRef<any>();
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);
  const [hovered, setHovered] = useState(false);

  const {
    orientation,
    character,
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

  const northTile = useMemo(() => tiles[`${gameId}-${col}-${row + 1}`], [gameId, tiles, col, row]);
  const eastTile = useMemo(() => tiles[`${gameId}-${col + 1}-${row}`], [gameId, tiles, col, row]);
  const southTile = useMemo(() => tiles[`${gameId}-${col}-${row - 1}`], [gameId, tiles, col, row]);
  const westTile = useMemo(() => tiles[`${gameId}-${col - 1}-${row}`], [gameId, tiles, col, row]);

  const isSelected = useMemo(() => {
    return selectedTile && selectedTile.col === col && selectedTile.row === row;
  }, [selectedTile, col, row]);

  const isHovered = useMemo(() => {
    return (
      enabled &&
      hovered &&
      hoveredTile &&
      hoveredTile.col === col &&
      hoveredTile.row === row
    );
  }, [hovered, hoveredTile, col, row, enabled]);

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
      checkFeatureIdle(
        gameId,
        activeTile,
        orientation,
        col,
        row,
        character,
        spot,
        tiles,
      )
    );
  }, [
    activeTile,
    hoveredTile,
    selectedTile,
    orientation,
    character,
    spot,
    hovered,
  ]);

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
    shouldUpdateTexture,
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
    setSelectedTile({ col, row });
    setX(col);
    setY(row);

    play();
  }, [selectedTile]);

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
  }, [row, col]);

  const { currentTutorialStage } = useTutorial();

  const modelPath = useMemo(() => activeTile?.getVarietyModelPath(col, row), [activeTile, col, row]);

  return (
    <>
      {activeTile && <TileEmptyComponent modelPath={modelPath ?? ""} size={size} col={col} row={row} tiles={tiles} isTutorial={isTutorial} />}
      <group position={[position.x, position.y, 0]}>
        <mesh
          visible={!texture}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onClick={handleSimpleClick}
          ref={meshRef}
          geometry={squareGeometry}
        >
          <meshStandardMaterial
            color={"#ADD8E6"}
            transparent={true}
            opacity={0.004}
          />
        </mesh>
        {position?.x === currentTutorialStage?.markedTile?.x &&
          position?.y === currentTutorialStage?.markedTile?.y &&
          isTutorial && <TileHighlight size={size} />}
      </group>
    </>
  );
};

const TileHighlight = ({ size }: { size: number }) => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
  } = useDojo();

  const { builder } = useBuilder({ gameId, playerId: account?.address });
  const { model: tile } = useTile({
    gameId,
    tileId: builder?.tile_id || 0,
  });

  const { selectedTile } = useGameStore();
  const { currentTutorialStage } = useTutorial();

  const orientation = currentTutorialStage?.presetTransaction.orientation;

  const imageUrl = useMemo(() => getImage(tile), [tile]);

  const texture = useTexture(imageUrl);

  return (
    texture && (
      <>
        <TileHighlightTooltip />
        <Plane
          args={[size, size, 1]}
          position={[0, 0, 0.1]}
          rotation={[0, 0, calculateRotation(orientation ?? 1)]}
          visible={!!texture}
        >
          <meshBasicMaterial map={texture} opacity={0.55} transparent={true} />
          <Edges
            linewidth={5}
            threshold={15}
            color={
              currentTutorialStage?.presetTransaction.x === selectedTile.col &&
                currentTutorialStage?.presetTransaction.y === selectedTile.row
                ? "lime"
                : !selectedTile
                  ? "blue"
                  : "red"
            }
          />
        </Plane>
      </>
    )
  );
};

const TileHighlightTooltip = () => {
  const { currentTutorialStage } = useTutorial();
  const { x, y } = useGameStore();

  const horizontalTextOffset = 6;
  const verticalTextOffset = 2;

  const textPositionVector = currentTutorialStage?.markedTileTextPosition;
  const interactionText =
    currentTutorialStage?.interactionText.get("tile-ingame");
  const interactionIndex =
    Array.from(currentTutorialStage.interactionText.keys()).indexOf(
      "tile-ingame",
    ) + 1;

  const shouldDisplayTutorialTooltip = useMemo(() => {
    if (!currentTutorialStage) return false;

    const {
      presetTransaction: { x: presetX, y: presetY },
    } = currentTutorialStage;

    const hasCoords = x === presetX && y === presetY;

    return !hasCoords;
  }, [currentTutorialStage, x, y]);

  return (
    shouldDisplayTutorialTooltip && (
      <Html
        transform
        position={[
          textPositionVector.x * horizontalTextOffset,
          textPositionVector.y * verticalTextOffset,
          0,
        ]}
        scale={0.75}
      >
        <p className="text-xs w-80 p-4 rounded pointer-events-none select-none">
          {interactionIndex}.{interactionText}
        </p>
      </Html>
    )
  );
};

const calculateRotation = (orientation: number) =>
  (Math.PI / 2) * (1 - orientation);

useTexture.preload([
  "/assets/tiles/ccccccccc.png",
  "/assets/tiles/cccccfffc.png",
  "/assets/tiles/cccccfrfc.png",
  "/assets/tiles/cfffcfffc.png",
  "/assets/tiles/ffcfffcff.png",
  "/assets/tiles/ffcfffffc.png",
  "/assets/tiles/ffffcccff.png",
  "/assets/tiles/ffffffcff.png",
  "/assets/tiles/rfffrfcfr.png",
  "/assets/tiles/rfffrfffr.png",
  "/assets/tiles/rfrfcccfr.png",
  "/assets/tiles/rfrfffcfr.png",
  "/assets/tiles/rfrfffffr.png",
  "/assets/tiles/rfrfrfcff.png",
  "/assets/tiles/sfrfrfcfr.png",
  "/assets/tiles/sfrfrfffr.png",
  "/assets/tiles/sfrfrfrfr.png",
  "/assets/tiles/wffffffff.png",
  "/assets/tiles/wfffffffr.png",
]);
