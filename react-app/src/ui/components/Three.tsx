import * as THREE from "three";
import { useEffect, useRef } from "react";
import { Canvas, extend } from "@react-three/fiber";

import {
  OrbitControls,
  PerspectiveCamera,
  MapControls,
  useKeyboardControls,
  Bounds,
} from "@react-three/drei";
import { TileTextures } from "./TileTextures";
import { CharTextures } from "./CharTextures";
import { Controls } from "@/ui/screens/GameScreen";
import { useGameStore } from "@/store";
extend({ OrbitControls });

export const cameraSettings = {
  zoom: 1,
  aspect: 1.77,
  near: 3,
  far: 10,
};

export const ThreeGrid = () => {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  return (
    <Canvas className="z-1" shadows>
      <color attach="background" args={["#E8DAE1"]} />
      <Keyboard />
      <mesh>
        <PerspectiveCamera
          ref={cameraRef}
          makeDefault
          position={[0, 90, 0]}
          zoom={cameraSettings.zoom}
          aspect={cameraSettings.aspect}
          near={cameraSettings.near}
          far={cameraSettings.far}
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
            <TileTextures squareSize={3} />
            <CharTextures radius={0.3} height={1} squareSize={3} />
          </Bounds>
        </mesh>
      </mesh>
    </Canvas>
  );
};

function Keyboard() {
  const [sub] = useKeyboardControls<Controls>();

  const { orientation, setOrientation } = useGameStore();

  useEffect(() => {
    return sub(
      (state) => state.clockwise,
      (pressed) => {
        if (pressed) {
          setOrientation(orientation + 1);
        }
      }
    );
  }, [orientation]);

  useEffect(() => {
    return sub(
      (state) => state.counterClockwise,
      (pressed) => {
        if (pressed) {
          setOrientation(orientation - 1);
        }
      }
    );
  }, [orientation]);

  return <></>;
}
