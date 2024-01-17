import * as THREE from "three";
import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, extend } from "@react-three/fiber";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useGameIdStore } from "../../store";
import { getImage } from "../../utils";

import {
  OrbitControls,
  PerspectiveCamera,
  MapControls,
  Bounds,
} from "@react-three/drei";
import { useDojo } from "@/dojo/useDojo";
extend({ OrbitControls });

const createSquareGeometry = (size: any) => {
  return new THREE.PlaneGeometry(size, size);
};

const Square = ({ position, size, col, row }: any) => {
  // Dojo part, could be removed to a better location
  const {
    account: { account },
    setup: {
      clientComponents: { Builder, Tile, TilePosition },
    },
  } = useDojo();

  const gameId = useGameIdStore((state: any) => state.gameId);

  const tilePositionId = getEntityIdFromKeys([
      BigInt(gameId),
      BigInt(col + 0x7fffffff),
      BigInt(row + 0x7fffffff),
  ]) as Entity;
  const tilePosition = useComponentValue(TilePosition, tilePositionId);

  const tileId = getEntityIdFromKeys([
    BigInt(tilePosition ? tilePosition.game_id : 0),
    BigInt(tilePosition ? tilePosition.tile_id : 0)
  ]) as Entity;
  const tile = useComponentValue(Tile, tileId);

  const meshRef = useRef<any>();

  const [lineThickness, setLineThickness] = useState(1);
  const [lineColor, setLineColor] = useState("gray");
  const [backgroundImage, setBackgroundImage] = useState(getImage(0));
  const [linePosition, setLinePosition] = useState(position);
  const [texture, setTexture] = useState<THREE.Texture | undefined>(undefined);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(backgroundImage, (loadedTexture) => {
      if (tile?.orientation) {
        const rotation = Math.PI / 2 * (tile.orientation - 1);
        loadedTexture.center.set(0.5, 0.5);
        loadedTexture.rotation = rotation; 
      }
      setTexture(loadedTexture);
    });
  }, [backgroundImage]);

  useEffect(() => {
    setBackgroundImage(getImage(tile));
  }, [tile]);

  const squareGeometry = useMemo(() => createSquareGeometry(size), [size]);

  const handleMeshClick = (event: any) => {
    console.log(`Col ${col}, Row ${row}`);
  };

  // const handlePointerEnter = () => {
  //   setBackgroundImage(one);
  // }

  // const handlePointerLeave = () => {
  //   setBackgroundImage(zero);
  // }

  return (
      <>
      <mesh
        // onPointerEnter={handlePointerEnter}
        // onPointerLeave={handlePointerLeave}
        // onClick={handleMeshClick}
        ref={meshRef}
        position={position}
        geometry={squareGeometry}
      >
        {texture && <meshStandardMaterial map={texture}/>}
      </mesh>
      <lineSegments
        geometry={new THREE.EdgesGeometry(squareGeometry)}
        material={
          new THREE.LineBasicMaterial({
            color: lineColor,
            linewidth: lineThickness,
          })
        }
        position={linePosition}
      />
    </>
  );
};

const SquareGrid = ({ rows, cols, squareSize }: any) => {
  const squares = [];
  const squareWidth = squareSize;
  const squareHeight = squareSize;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const offset_x = Math.floor(cols / 2);
      const offset_y = Math.floor(rows / 2);
      const x = col * squareWidth;
      const y = row * squareHeight;
      squares.push(
        <Square
          key={`${row}-${col}`}
          position={[x, y, 0]}
          size={squareSize}
          col={col - offset_x}
          row={row - offset_y}
        />
      );
    }
  }
  return <>{squares}</>;
};
export const ThreeGrid = () => {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);

  const handleClick = (event: any) => {
    console.log("position", cameraRef?.current?.position);
  };

  return (
    <Canvas className="z-1" shadows>
      <mesh>
        <PerspectiveCamera
          ref={cameraRef}
          makeDefault
          position={[0, 90, 0]}
          zoom={2}
          aspect={1.77}
          near={3}
          far={3}
        />
        <MapControls makeDefault target={[0, 0, 0]} />
        <ambientLight color={"white"} intensity={1} />
        <pointLight
          rotation={[Math.PI / -2, 0, 0]}
          position={[10, 20, 10]}
          intensity={20}
        />
        <mesh rotation={[Math.PI / -2, 0, 0]}>
          <Bounds fit clip observe margin={1}>
            <SquareGrid rows={30} cols={30} squareSize={3} />
          </Bounds>
        </mesh>
      </mesh>
    </Canvas>
  );
};
