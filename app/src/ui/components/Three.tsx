import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  useKeyboardControls,
  OrthographicCamera,
  OrbitControls,
  Stats,
  Sky,
  Clouds,
  Cloud,
  SoftShadows,
} from "@react-three/drei";
import { TileTextures } from "./TileTextures";
import { CharTextures } from "./CharTextures";
import { Controls } from "@/ui/screens/GameScreen";
import { useGameStore, useCameraStore } from "@/store";
import { Perf } from "r3f-perf";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  Noise,
  Vignette,
  Outline,
  SSAO,
  Grid,
} from "@react-three/postprocessing";
import { BlendFunction, Resizer, KernelSize } from "postprocessing";
import useSound from "use-sound";
import RotationSound from "/sounds/rotation.wav";

export const ThreeGrid = () => {
  const mesh = useRef<THREE.Mesh>(null!);
  return (
    <Canvas className="z-1" frameloop="demand">
      <Keyboard />
      <mesh ref={mesh}>
        <Camera>
          <directionalLight
            color={"white"}
            intensity={3}
            position={[0, 5, 0]}
            castShadow
          />
          <directionalLight
            color={"white"}
            intensity={3}
            position={[10, 5, 10]}
            castShadow
          />

          <MainScene />
        </Camera>
        <fog attach="fog" args={["#d0d0d0", 8, 35]} />
        <EffectComposer>
          <Vignette eskil={false} offset={0.1} darkness={0.8} />
          <Bloom mipmapBlur luminanceThreshold={3} />
          <Noise
            premultiply // enables or disables noise premultiplication
            blendFunction={BlendFunction.COLOR} // blend mode
          />
        </EffectComposer>
      </mesh>
    </Canvas>
  );
};

export const MainScene = () => {
  const { compassRotation } = useCameraStore();

  return (
    <mesh rotation={[Math.PI / -2, 0, compassRotation]}>
      <TileTextures squareSize={3} />
      <CharTextures radius={0.3} height={1.5} squareSize={3} />
    </mesh>
  );
};

function Keyboard() {
  const [sub] = useKeyboardControls<Controls>();

  const [play, { stop }] = useSound(RotationSound);

  const {
    orientation,
    spot,
    setOrientation,
    rotateSpot,
    strategyMode,
    setStrategyMode,
  } = useGameStore();

  useEffect(() => {
    return sub(
      (state) => state.clockwise,
      (pressed) => {
        if (pressed) {
          play();
          setOrientation(orientation + 1);
          rotateSpot(spot, true);
        }
      }
    );
  }, [orientation, spot]);

  useEffect(() => {
    return sub(
      (state) => state.counterClockwise,
      (pressed) => {
        if (pressed) {
          play();
          setOrientation(orientation - 1);
          rotateSpot(spot, false);
        }
      }
    );
  }, [orientation, spot]);

  useEffect(() => {
    return sub(
      (state) => state.strategyMode,
      (pressed) => {
        if (pressed) {
          setStrategyMode(!strategyMode);
        }
      }
    );
  }, [strategyMode]);

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
        minPolarAngle={(101 * Math.PI) / 200} // Allow looking directly down
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
