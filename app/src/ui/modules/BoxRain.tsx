import { memo, useMemo, useRef } from "react";
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
      meshRef.current.position.y -= 0.01;

      // Adjust the threshold to a lower value to make the boxes fall further
      if (meshRef.current.position.y < -20) {
        meshRef.current.position.y = 10;
        meshRef.current.position.x = Math.random() * 20 - 10;
        meshRef.current.position.z = Math.random() * 20 - 10;
      }
    }
  });

  return <primitive ref={meshRef} object={model} position={initPosition} />;
};

const BoxRainScene = memo(() => {
  const models = useMemo(() => {
    return [
      useGLTF("/models/ccccccccc_HF_1.glb").scene.clone(),
      useGLTF("/models/cccccfffc_HF_1.glb").scene.clone(),
      useGLTF("/models/cccccfrfc_HF_1.glb").scene.clone(),
      useGLTF("/models/cfffcfffc_HF_1.glb").scene.clone(),
      useGLTF("/models/ffcfffcff_HF_1.glb").scene.clone(),
      useGLTF("/models/ffcfffffc_HF_1.glb").scene.clone(),
      useGLTF("/models/ffffcccff_HF_1.glb").scene.clone(),
      useGLTF("/models/ffffffcff_HF_1.glb").scene.clone(),
      useGLTF("/models/rfffrfcfr_HF_1.glb").scene.clone(),
      useGLTF("/models/rfffrfffr_HF_1.glb").scene.clone(),
      useGLTF("/models/rfrfcccfr_HF_1.glb").scene.clone(),
      useGLTF("/models/rfrfffcfr_HF_1.glb").scene.clone(),
      useGLTF("/models/rfrfffffr_HF_1.glb").scene.clone(),
      useGLTF("/models/rfrfrfcff_HF_1.glb").scene.clone(),
      useGLTF("/models/sfrfrfcfr_HF_1.glb").scene.clone(),
      useGLTF("/models/sfrfrfffr_HF_1.glb").scene.clone(),
      useGLTF("/models/sfrfrfrfr_HF_1.glb").scene.clone(),
      useGLTF("/models/wffffffff_HF_1.glb").scene.clone(),
      useGLTF("/models/wfffffffr_HF_1.glb").scene.clone(),
    ];
  }, []);

  const boxes = useMemo(
    () =>
      Array.from({ length: 100 }, () => ({
        position: new Vector3(
          Math.random() * 20 - 10,
          Math.random() * 20 + 10,
          Math.random() * 40 - 10,
        ),
        // Select a random model for each box
        model: models[Math.floor(Math.random() * models.length)],
        scale: 0.1,
      })),
    [models],
  );

  return (
    <div className="absolute inset-0 pointer-events-none">
      <Canvas style={{ width: "100%", height: "100%" }}>
        <ambientLight />
        <directionalLight
          color={"white"}
          intensity={5}
          position={[0, 10, 0]}
          castShadow
        />
        <pointLight position={[10, 10, 10]} />
        <mesh scale={0.2}>
          {boxes.map((box, index) => (
            <BoxRain
              key={index}
              initPosition={box.position}
              model={box.model}
            />
          ))}
        </mesh>
      </Canvas>
    </div>
  );
});

export default BoxRainScene;
