import * as THREE from "three";
import { useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  useKeyboardControls,
  OrbitControls,
  PerspectiveCamera,
} from "@react-three/drei";
import { TileTextures } from "./TileTextures";
import { CharTextures } from "./CharTextures";
import { Controls } from "@/ui/screens/GameScreen";
import { useGameStore, useCameraStore, useUIStore } from "@/store";
import {
  Bloom,
  EffectComposer,
  Vignette,
  N8AO,
} from "@react-three/postprocessing";
import useSound from "use-sound";
import RotationSound from "/sounds/rotation.wav";
import { useControls, Leva } from "leva";

const Light = () => {
  const lightRef = useRef<THREE.DirectionalLight>(null!);
  const { ambientIntensity, intensity, position } = useControls("Light", {
    ambientIntensity: {
      value: 5,
      min: 0,
      max: 20,
      step: 0.01,
    },
    intensity: {
      value: 3,
      min: 0,
      max: 20,
      step: 0.01,
    },
    position: {
      value: [-0.5, 13, 6.5],
      min: [-5, -5, -5],
      max: [5, 5, 5],
      step: 0.01,
    },
  });
  return (
    <>
      <Leva
        fill // default = false,  true makes the pane fill the parent dom node it's rendered in
        flat // default = false,  true removes border radius and shadow
        oneLineLabels // default = false, alternative layout for labels, with labels and fields on separate rows
        collapsed // default = false, when true the GUI is collpased
        hidden // default = false, when true the GUI is hidden
      />
      <spotLight
        position={[10, 10, 10]}
        angle={0.15}
        penumbra={1}
        intensity={1}
        castShadow
      />
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
        shadow-camera-far={12}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
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
        <Effects />
      </mesh>
    </Canvas>
  );
};

export const Effects = () => {
  const { distanceFalloff, aoRadius, intensity } = useControls(
    "Postprocessing",
    {
      distanceFalloff: {
        value: 1,
        min: 0,
        max: 5,
        step: 0.01,
      },
      aoRadius: {
        value: 1,
        min: 0,
        max: 5,
        step: 0.01,
      },
      intensity: {
        value: 2,
        min: 0,
        max: 5,
        step: 0.01,
      },
    },
  );

  return (
    <EffectComposer>
      <Vignette eskil={false} offset={0.1} darkness={0.8} />
      <Bloom mipmapBlur luminanceThreshold={3} />
      <N8AO distanceFalloff={2} aoRadius={2} intensity={2} quality="ultra" />
    </EffectComposer>
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
        }
      },
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
      },
    );
  }, [orientation, spot]);

  useEffect(() => {
    return sub(
      (state) => state.strategyMode,
      (pressed) => {
        if (pressed) {
          setStrategyMode(!strategyMode);
        }
      },
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
        minDistance={5}
        maxDistance={30}
        touches={{
          ONE: THREE.TOUCH.PAN,
          TWO: THREE.TOUCH.DOLLY_PAN
        }}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
      />
      <PerspectiveCamera
        ref={camera}
        zoom={zoom}
        rotation={rotation}
        near={near}
        far={far}
      >
        {children}
      </PerspectiveCamera>
    </>
  );
}
