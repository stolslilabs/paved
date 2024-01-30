import * as THREE from "three";
import { useDojo } from "@/dojo/useDojo";
import { offset, other_offset } from "@/utils";
import { useComponentValue } from "@dojoengine/react";
import { Entity } from "@dojoengine/recs";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { useMemo, useRef } from "react";
import { getColorFromCharacter } from "../../utils";

export const loader = new THREE.TextureLoader();

export const createCylinderGeometry = (radius: number, height: number) => {
  return new THREE.CylinderGeometry(radius, radius, height, 32);
};

export const CharTexture = ({
  entity,
  radius,
  height,
  size,
}: any) => {
  const {
    setup: {
      clientComponents: { Character, Tile },
    },
  } = useDojo();
  const meshRef = useRef<any>();

  const cylinderGeometry = useMemo(() => createCylinderGeometry(radius, height), []);

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
    return getColorFromCharacter(character?.index);
  }, [character]);

  if (!character || character.tile_id == 0) return;

  return (
    <>
      <mesh
        ref={meshRef}
        position={[position.x, position.y, height / 2]}
        geometry={cylinderGeometry}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial color={color} />
      </mesh>
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
}

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
}