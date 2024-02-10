import * as THREE from "three";
import { useDojo } from "@/dojo/useDojo";
import { offset, other_offset } from "@/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useMemo, useRef } from "react";
import { getCharacterImage, getColorFromAddress } from "../../utils";
import { useFrame } from "@react-three/fiber";

// Assets

import lord from "/assets/characters/lord.png";

export const loader = new THREE.TextureLoader();

export const CharTexture = ({ entity, radius, height, size }: any) => {
  const {
    setup: {
      clientComponents: { Character, Tile },
    },
  } = useDojo();
  const meshRef = useRef<any>();

  const character = useComponentValue(Character, entity);

  const tileEntity = getEntityIdFromKeys([
    BigInt(character?.game_id),
    BigInt(character?.tile_id),
  ]) as Entity;

  const tile = useComponentValue(Tile, tileEntity);

  const position = useMemo(() => {
    const position = getCharacterPosition({
      row: tile ? tile?.y - offset + other_offset : 0,
      col: tile ? tile?.x - offset + other_offset : 0,
      spot: character ? character.spot : 0,
      size,
    });
    return position;
  }, [tile]);

  const color = useMemo(() => {
    const address = `0x${character?.builder_id?.toString(16)}`;
    return getColorFromAddress(address);
  }, [character]);

  const image = useMemo(() => {
    return getCharacterImage(character?.index);
  }, [character]);

  useFrame(({ camera }) => {
    if (meshRef.current) {
      const lookAtPoint = new THREE.Vector3(0, -10000, 0);
      camera.localToWorld(lookAtPoint);
      meshRef.current.lookAt(lookAtPoint);
    }
  });

  if (!character || character.tile_id == 0) return;

  return (
    <>
      {/* Pedestal */}
      <mesh
        position={[position.x, position.y, 0.1 / 3]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial color={0x000000} />
        <cylinderGeometry args={[radius * 1.2, radius * 1.2, 0.1, 32]} />
      </mesh>
      <mesh
        position={[position.x, position.y, 0.1 / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial color={color} />
        <cylinderGeometry args={[radius, radius, 0.1, 32]} />
      </mesh>
      {/* Rod */}
      <mesh
        position={[position.x, position.y, height]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial color={0x000000} />
        <cylinderGeometry args={[0.01, 0.01, height * 2, 32]} />
      </mesh>
      {/* Character */}
      <group
        position={[position.x, position.y, 2 * height + radius * 1.2]}
        ref={meshRef}
      >
        <mesh>
          <meshStandardMaterial color={color} />
          <cylinderGeometry args={[radius * 1.2, radius * 1.2, 0.1, 32]} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <meshStandardMaterial map={loader.load(image)} />
          <cylinderGeometry args={[radius, radius, 0.15, 32]} />
        </mesh>
      </group>
    </>
  );
};

export const getCharacterPosition = ({
  row,
  col,
  spot,
  size,
}: {
  row: number;
  col: number;
  spot: number;
  size: number;
}) => {
  const x = col * size + getOffsetX(spot, size);
  const y = row * size + getOffsetY(spot, size);

  return { x, y };
};

export const getOffsetX = (spot: number, size: number) => {
  switch (spot) {
    case 2:
      return -size / 3;
    case 4:
      return size / 3;
    case 5:
      return size / 3;
    case 6:
      return size / 3;
    case 8:
      return -size / 3;
    case 9:
      return -size / 3;
    default:
      return 0;
  }
};

export const getOffsetY = (spot: number, size: number) => {
  switch (spot) {
    case 2:
      return size / 3;
    case 3:
      return size / 3;
    case 4:
      return size / 3;
    case 6:
      return -size / 3;
    case 7:
      return -size / 3;
    case 8:
      return -size / 3;
    default:
      return 0;
  }
};
