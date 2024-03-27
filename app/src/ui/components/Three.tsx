import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  useKeyboardControls,
  OrthographicCamera,
  OrbitControls,
} from "@react-three/drei";
import { TileTextures } from "./TileTextures";
import { CharTextures } from "./CharTextures";
import { Controls } from "@/ui/screens/GameScreen";
import { useGameStore, useCameraStore } from "@/store";

export const ThreeGrid = () => {
  return (
    <Canvas className="z-1" shadows>
      <Keyboard />
      <mesh>
        <Camera>
          <ambientLight color={"white"} intensity={1} />
          <ambientLight color={"white"} intensity={1} />
          <MainScene />
        </Camera>
      </mesh>
    </Canvas>
  );
};

export const MainScene = () => {
  const { compassRotation } = useCameraStore();

  return (
    <mesh rotation={[Math.PI / -2, 0, compassRotation]}>
      <TileTextures squareSize={3} />
      <CharTextures radius={0.3} height={1} squareSize={3} />
    </mesh>
  );
};

function Keyboard() {
  const [sub] = useKeyboardControls<Controls>();

  const { orientation, spot, setOrientation, rotateSpot } = useGameStore();

  useEffect(() => {
    return sub(
      (state) => state.clockwise,
      (pressed) => {
        if (pressed) {
          setOrientation(orientation + 1);
          rotateSpot(spot, true);
        }
      },
    );
  }, [orientation, spot]);

  useEffect(() => {
    return sub(
      (state) => state.counterClockwise,
      (pressed) => {
        if (pressed) {
          setOrientation(orientation - 1);
          rotateSpot(spot, false);
        }
      },
    );
  }, [orientation, spot]);

  return <></>;
}

function Camera({ children }: { children?: React.ReactNode }) {
  const {
    position,
    zoom,
    near,
    far,
    reset,
    resetAll,
    rotation,
    resetButPosition,
    resetCompassRotation,
  } = useCameraStore();
  const camera = useRef<any>(null);
  const controls = useRef<any>(null);

  useEffect(() => {
    if (reset) {
      controls.current.reset();
      resetAll();
      resetCompassRotation();
    } else if (camera.current) {
      controls.current.reset();
      resetButPosition();
      resetCompassRotation();
      camera.current.position.set(...position);
    }
  }, [reset, position]);

  return (
    <>
      <OrbitControls
        enableRotate={true}
        zoomToCursor
        panSpeed={0.8}
        rotateSpeed={0.1}
        enablePan={true}
        enableDamping
        ref={controls}
        makeDefault
        target={[0, 0, 0]}
        minAzimuthAngle={0}
        maxAzimuthAngle={0}
        minPolarAngle={(501 * Math.PI) / 1000} // Allow looking directly down
        maxPolarAngle={Math.PI}
        zoomSpeed={0.8}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
      />
      <OrthographicCamera
        // makeDefault
        ref={camera}
        zoom={zoom}
        isOrthographicCamera
        rotation={rotation}
        near={near}
        far={far}
      >
        {children}
      </OrthographicCamera>
    </>
  );
}
