import * as THREE from "three";
import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  MapControls,
  useKeyboardControls,
  Bounds,
  OrthographicCamera,
  SpotLight,
  useDepthBuffer,
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
          <Lighting />
          <mesh rotation={[Math.PI / -2, 0, 0]}>
            <TileTextures squareSize={3} />
            <CharTextures radius={0.3} height={1} squareSize={3} />
          </mesh>
        </Camera>
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

function Camera({ children }: { children?: React.ReactNode }) {
  const { position, zoom, aspect, near, far, reset, resetAll, rotation } =
    useCameraStore();
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const controls = useRef<any>(null);

  useEffect(() => {
    if (reset) {
      controls.current.reset();
      resetAll();
    } else if (camera.current) {
      camera.current.position.set(...position);
    }
  }, [reset, position]);

  return (
    <>
      <OrthographicCamera
        // makeDefault
        zoom={zoom}
        rotation={rotation}
        // aspect={aspect}
        near={near}
        far={far}
      >
        <OrbitControls
          enableRotate={true}
          zoomToCursor
          panSpeed={0.4}
          rotateSpeed={0.2}
          enablePan={true}
          enableDamping
          ref={controls}
          makeDefault
          target={[0, 0, 0]}
          minAzimuthAngle={-Math.PI / 4}
          maxAzimuthAngle={Math.PI / 4}
        />
        {children}
      </OrthographicCamera>
    </>
  );
}

function Lighting() {
  const depthBuffer = useDepthBuffer({ frames: 1 });
  return (
    <>
      <MovingSpot
        depthBuffer={depthBuffer}
        color="#fff"
        position={[3, 10, 2]}
      />
    </>
  );
}

function MovingSpot({ vec = new THREE.Vector3(), ...props }) {
  const light = useRef<any>();
  const viewport = useThree((state) => state.viewport);
  useFrame((state) => {
    light.current.target.position.lerp(
      vec.set(
        (state.mouse.x * viewport.width) / 2,
        (state.mouse.y * viewport.height) / 2,
        0
      ),
      1
    );
    light.current.target.updateMatrixWorld();
  });
  return (
    <SpotLight
      castShadow
      ref={light}
      penumbra={1}
      distance={100}
      angle={0.9}
      attenuation={5}
      anglePower={9}
      intensity={110}
      {...props}
    />
  );
}
