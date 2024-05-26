import * as THREE from "three";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useGameStore } from "@/store";
import { offset, other_offset } from "@/dojo/game";
import { checkCompatibility } from "@/dojo/game/types/layout";
import { createSquareGeometry, getSquarePosition } from "./TileTexture";
import { useQueryParams } from "@/hooks/useQueryParams";
import { checkFeatureIdle } from "@/dojo/game/helpers/conflict";
import useSound from "use-sound";

import Place from "/sounds/p-place.m4a";
import { useTileByKey } from "@/hooks/useTile";
import { useActions } from "@/hooks/useActions";
import { getComponentValue } from "@dojoengine/recs";
import { useGLTF } from "@react-three/drei";

const loader = new THREE.TextureLoader();

export const TileEmpty = ({ tiles, col, row, size }: any) => {
  const [play, { stop }] = useSound(Place);

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
  const strategyMode = useGameStore((state) => state.strategyMode);

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
        tiles
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

  const models = useMemo(() => {
    return {
      1: useGLTF("/models/ccccccccc.glb").scene.clone(),
      2: useGLTF("/models/cccccfffc.glb").scene.clone(),
      3: useGLTF("/models/cccccfrfc.glb").scene.clone(),
      4: useGLTF("/models/cfffcfffc.glb").scene.clone(),
      5: useGLTF("/models/ffcfffcff.glb").scene.clone(),
      6: useGLTF("/models/ffcfffffc.glb").scene.clone(),
      7: useGLTF("/models/ffffcccff.glb").scene.clone(),
      8: useGLTF("/models/ffffffcff.glb").scene.clone(),
      9: useGLTF("/models/rfffrfcfr.glb").scene.clone(),
      10: useGLTF("/models/rfffrfffr.glb").scene.clone(),
      11: useGLTF("/models/rfrfcccfr.glb").scene.clone(),
      12: useGLTF("/models/rfrfffcfr.glb").scene.clone(),
      13: useGLTF("/models/rfrfffffr.glb").scene.clone(),
      14: useGLTF("/models/rfrfrfcff.glb").scene.clone(),
      15: useGLTF("/models/sfrfrfcfr.glb").scene.clone(),
      16: useGLTF("/models/sfrfrfffr.glb").scene.clone(),
      17: useGLTF("/models/sfrfrfrfr.glb").scene.clone(),
      18: useGLTF("/models/wffffffff.glb").scene.clone(),
      19: useGLTF("/models/wfffffffr.glb").scene.clone(),
    };
  }, []);

  const getColorBasedOnState = (isValid: boolean, isIdle: boolean) => {
    if (!isValid) {
      return "orange"; // Color for invalid state
    }
    if (isIdle) {
      return null; // Color for idle state when valid
    }
    return null; // No color change when valid and not idle
  };
  // TODO: this is weird now
  const shadowedModel = useMemo(() => {
    const model =
      models[(activeTile?.plan.into() as keyof typeof models) || 1].clone();
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const dim = box.getSize(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.y -= center.y;
    model.position.z -= center.z;
    model.position.y += dim.y * 0.5;
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = child.material.clone();
        child.castShadow = true;
        child.receiveShadow = true;

        const color = getColorBasedOnState(isValid || false, isIdle || false);
        if (color) {
          child.material.color.set(color);
        } else {
          // Reset to default color or make transparent
          child.material.color.setHex(0xffffff); // Assuming white is the default
        }
        child.material.transparent = true;
        child.material.opacity = 0.8;
      }
    });
    return model;
  }, [activeTile, isIdle, isValid]);

  const scale = useMemo(() => {
    if (!shadowedModel) return 1;
    const box = new THREE.Box3().setFromObject(shadowedModel);
    const dim = box.getSize(new THREE.Vector3());
    return (2 * size) / (dim.x + dim.z);
  }, [shadowedModel]);

  const meshComponent = useMemo(
    () => (
      <>
        <group
          visible={texture !== undefined && !strategyMode}
          ref={meshRef}
          key={`tile-${activeTile?.id}`}
          scale={scale}
          rotation={[
            Math.PI / 2,
            (Math.PI / 2) * (1 - (activeTile?.orientation.into() || 1)),
            0,
          ]}
          position={[position.x, position.y, 0]}
        >
          <primitive object={shadowedModel} />
        </group>
        <mesh
          visible={texture !== undefined && strategyMode}
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
      </>
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
    ]
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
        <meshStandardMaterial
          color={"#ADD8E6"}
          transparent={true}
          opacity={0.004}
        />
      </mesh>
    </>
  );
};

const calculateRotation = (orientation: any) =>
  (Math.PI / 2) * (1 - orientation);
