import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  useKeyboardControls,
  OrthographicCamera,
  OrbitControls,
  Stats,
  Sky,
  Clouds,
  Cloud,
  SoftShadows,
  PerspectiveCamera,
  Box,
  useHelper,
} from "@react-three/drei";
import { TileTextures } from "./TileTextures";
import { CharTextures } from "./CharTextures";
import { Controls } from "@/ui/screens/GameScreen";
import { useGameStore, useCameraStore, useUIStore } from "@/store";
import { Perf } from "r3f-perf";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  Noise,
  Vignette,
  Outline,
  SSAO,
  ColorAverage,
  Grid,
  HueSaturation,
} from "@react-three/postprocessing";
import { BlendFunction, Resizer, KernelSize } from "postprocessing";
import useSound from "use-sound";
import RotationSound from "/sounds/rotation.wav";
import { Button } from "../elements/button";
import { useControls } from "leva";

const Light = () => {
  const lightRef = useRef<THREE.DirectionalLight>(null!);
  useHelper(lightRef, THREE.DirectionalLightHelper, 10, "hotpink");

  const { ambientIntensity, intensity, position } = useControls("Light", {
    ambientIntensity: {
      value: 1,
      min: 0,
      max: 2,
      step: 0.01,
    },
    intensity: {
      value: 1.5,
      min: 0,
      max: 2,
      step: 0.01,
    },
    position: {
      value: [-1, 4, 1],
      min: [-5, -5, -5],
      max: [5, 5, 5],
      step: 0.01,
    },
  });
  return (
    <>
      <ambientLight
        name="Default Ambient Light"
        intensity={ambientIntensity}
        color="white"
      />
      <directionalLight
        ref={lightRef}
        color={"white"}
        intensity={intensity}
        position={position}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0}
        shadow-camera-far={5}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.01}
      />
    </>
  );
};
export const ThreeGrid = () => {
  const mesh = useRef<THREE.Mesh>(null!);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  return (
    <Canvas
      onCreated={({ gl }) => {
        gl.domElement.id = "canvas";
      }}
      dpr={[0.5, 1]}
      shadows
      className="z-1"
      frameloop="demand"
      ref={canvasRef}
    >
      <Keyboard />
      <mesh ref={mesh}>
        <Camera>
          <ScreenShotCube />
          <Light />
          <MainScene />
        </Camera>

        <EffectComposer>
          <Vignette eskil={false} offset={0.1} darkness={0.8} />
          <Bloom mipmapBlur luminanceThreshold={3} />
          <Noise
            premultiply // enables or disables noise premultiplication
            blendFunction={BlendFunction.COLOR} // blend mode
          />
          {/* <HueSaturation
            blendFunction={BlendFunction.NORMAL} // blend mode
            hue={50} // hue in radians
            saturation={30} // saturation in radians
          /> */}
        </EffectComposer>
      </mesh>
    </Canvas>
  );
};

export const ScreenShotCube = () => {
  const mesh = useRef<THREE.Mesh>(null!);

  const { gl, camera, scene } = useThree();

  const setTakeScreenshot = useUIStore((state) => state.setTakeScreenshot);

  const takeScreenshot = async () => {
    gl.render(scene, camera);

    const imgData = gl.domElement.toDataURL("image/png");
    const imgBlob = await (await fetch(imgData)).blob();

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          [imgBlob.type]: imgBlob,
        }),
      ]);
      console.log("Image copied to clipboard");
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    setTakeScreenshot(takeScreenshot);
  }, []);

  return <mesh ref={mesh} onClick={() => takeScreenshot()}></mesh>;
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
      <PerspectiveCamera
        // makeDefault
        ref={camera}
        zoom={zoom}
        // isOrthographicCamera
        rotation={rotation}
        near={near}
        far={far}
      >
        {children}
      </PerspectiveCamera>
    </>
  );
}
