import * as THREE from "three";
import { useEffect, useRef } from "react";
import { Canvas, extend } from "@react-three/fiber";
import { useState } from "react";
import {
  PerspectiveCamera,
  MapControls,
  useKeyboardControls,
  Bounds,
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
        <Camera />
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

function Camera() {
  const { position, zoom, aspect, near, far, reset, resetAll } =
    useCameraStore();
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const constrols = useRef<any>(null);

  useEffect(() => {
    if (reset) {
      constrols.current.reset();
      resetAll();
    } else if (camera.current) {
      camera.current.position.set(...position);
    }
  }, [reset, position]);

  return (
    <>
      <PerspectiveCamera
        ref={camera}
        makeDefault
        zoom={zoom}
        aspect={aspect}
        near={near}
        far={far}
      />
      <MapControls ref={constrols} makeDefault target={[0, 0, 0]} />
    </>
  );
}
