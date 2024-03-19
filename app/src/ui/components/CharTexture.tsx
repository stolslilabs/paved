import * as THREE from "three";
import { useEffect, useState } from "react";
import { useDojo } from "@/dojo/useDojo";
import {
  offset,
  other_offset,
  getCharacterImage,
  getColor,
  getOrder,
} from "@/dojo/game";
import { useComponentValue } from "@dojoengine/react";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { shortString } from "starknet";
import font from "/assets/fonts/RubikMonoOne-Regular.ttf";
import { useBuilder } from "@/hooks/useBuilder";
import { usePlayer } from "@/hooks/usePlayer";
import { useTile } from "@/hooks/useTile";

// Assets

export const loader = new THREE.TextureLoader();

export const CharTexture = ({ entity, radius, height, size }: any) => {
  const {
    setup: {
      clientModels: {
        models: { Character },
      },
    },
  } = useDojo();
  const meshRef = useRef<any>();
  const [hovered, setHovered] = useState(false);
  const [name, setName] = useState("");

  const character = useComponentValue(Character, entity);
  const { builder } = useBuilder({
    gameId: character?.game_id,
    playerId: character?.player_id,
  });
  const { player } = usePlayer({ playerId: character?.player_id });
  const { tile } = useTile({
    gameId: character?.game_id,
    tileId: character?.tile_id,
  });

  const position = useMemo(() => {
    const position = getCharacterPosition({
      row: tile ? tile?.y - offset + other_offset : 0,
      col: tile ? tile?.x - offset + other_offset : 0,
      spot: character ? character.spot : 0,
      size,
    });
    return position;
  }, [tile]);

  const charColor = useMemo(() => {
    const address = `0x${character?.player_id?.toString(16)}`;
    return getColor(address);
  }, [character]);

  const orderColor = useMemo(() => {
    return getColor(`${getOrder(builder?.order)}`);
  }, [builder]);

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

  useEffect(() => {
    if (player) {
      const fullname = shortString.decodeShortString(player.name);
      // Keep only the first 8 characters and if it cuts the name, add "..."
      setName(
        fullname.length > 8
          ? `${fullname.slice(0, 8)}...`
          : fullname.slice(0, 11)
      );
    }
  }, [player]);

  const handlePointerEnter = () => {
    setHovered(true);
  };

  const handlePointerLeave = () => {
    setHovered(false);
  };

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
        <meshStandardMaterial color={orderColor} />
        <cylinderGeometry args={[radius, radius, 0.12, 32]} />
      </mesh>
      <mesh
        position={[position.x, position.y, 0.1 / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial color={charColor} />
        <cylinderGeometry args={[radius * 0.8, radius * 0.8, 0.14, 32]} />
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
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <mesh>
          <meshStandardMaterial color={orderColor} />
          <Text
            position={[0, 0, -0.5]}
            rotation={[-Math.PI / 2, Math.PI, 0]}
            color={"black"}
            font={font}
            fontSize={0.3}
            anchorX="center"
            anchorY="bottom"
          >
            {hovered ? name : ""}
          </Text>
          <cylinderGeometry
            args={[
              radius * 1.2,
              radius * 1.2,
              0.01,
              32,
              1,
              false,
              -Math.PI / 2,
              Math.PI,
            ]}
          />
        </mesh>
        <mesh>
          <meshStandardMaterial color={charColor} />
          <cylinderGeometry
            args={[
              radius * 1.2,
              radius * 1.2,
              0.01,
              32,
              1,
              false,
              Math.PI / 2,
              Math.PI,
            ]}
          />
        </mesh>
        <mesh rotation={[0, -Math.PI / 2, 0]}>
          <meshStandardMaterial map={loader.load(image)} />
          <cylinderGeometry args={[radius, radius, 0.02, 32]} />
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
