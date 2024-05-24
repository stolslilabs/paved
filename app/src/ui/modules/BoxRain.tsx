import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { useGLTF } from "@react-three/drei";

// Updated BoxRain component to accept a model prop
const BoxRain = ({
  initPosition,
  model,
}: {
  initPosition: Vector3;
  model: any;
}) => {
  const meshRef = useRef<any>();

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.y -= 0.02;
      // meshRef.current.rotation.x += 0.01;
      // meshRef.current.rotation.y += 0.1;

      if (meshRef.current.position.y < -10) {
        meshRef.current.position.y = 10;
        meshRef.current.position.x = Math.random() * 20 - 10;
        meshRef.current.position.z = Math.random() * 20 - 10;
      }
    }
  });

  return <primitive ref={meshRef} object={model} position={initPosition} />;
};

const BoxRainScene = () => {
  const models = useMemo(() => {
    return [
      useGLTF("/models/ccccccccc.glb").scene.clone(),
      useGLTF("/models/cccccfffc.glb").scene.clone(),
      useGLTF("/models/cccccfrfc.glb").scene.clone(),
      useGLTF("/models/cfffcfffc.glb").scene.clone(),
      useGLTF("/models/ffcfffcff.glb").scene.clone(),
      useGLTF("/models/ffcfffffc.glb").scene.clone(),
      useGLTF("/models/ffffcccff.glb").scene.clone(),
      useGLTF("/models/ffffffcff.glb").scene.clone(),
      useGLTF("/models/rfffrfcfr.glb").scene.clone(),
      useGLTF("/models/rfffrfffr.glb").scene.clone(),
      useGLTF("/models/rfrfcccfr.glb").scene.clone(),
      useGLTF("/models/rfrfffcfr.glb").scene.clone(),
      useGLTF("/models/rfrfffffr.glb").scene.clone(),
      useGLTF("/models/rfrfrfcff.glb").scene.clone(),
      useGLTF("/models/sfrfrfcfr.glb").scene.clone(),
      useGLTF("/models/sfrfrfffr.glb").scene.clone(),
      useGLTF("/models/sfrfrfrfr.glb").scene.clone(),
      useGLTF("/models/wffffffff.glb").scene.clone(),
      useGLTF("/models/wfffffffr.glb").scene.clone(),
    ];
  }, []);

  const boxes = useMemo(
    () =>
      Array.from({ length: 100 }, () => ({
        position: new Vector3(
          Math.random() * 20 - 10,
          Math.random() * 20 + 10,
          Math.random() * 20 - 10
        ),
        // Select a random model for each box
        model: models[Math.floor(Math.random() * models.length)],
        scale: 0.2,
      })),
    [models]
  );

  return (
    <Canvas>
      <ambientLight />
      <directionalLight
        color={"white"}
        intensity={5}
        position={[0, 10, 0]}
        castShadow
      />
      <pointLight position={[10, 10, 10]} />
      {boxes.map((box, index) => (
        <BoxRain key={index} initPosition={box.position} model={box.model} />
      ))}
    </Canvas>
  );
};

export default BoxRainScene;
