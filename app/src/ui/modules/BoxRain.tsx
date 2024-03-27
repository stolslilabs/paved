import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Vector3 } from "three";

const BoxRain = ({ initPosition }: { initPosition: Vector3 }) => {
  const meshRef = useRef<any>();

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.y -= 0.1;
      meshRef.current.rotation.x += 0.01;
      meshRef.current.rotation.y += 0.01;

      if (meshRef.current.position.y < -10) {
        meshRef.current.position.y = 10;
        meshRef.current.position.x = Math.random() * 20 - 10;
        meshRef.current.position.z = Math.random() * 20 - 10;
      }
    }
  });

  return (
    <mesh ref={meshRef} position={initPosition}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#FCF7E7" />
    </mesh>
  );
};

const BoxRainScene = () => {
  const boxes = Array.from({ length: 100 }, () => ({
    position: new Vector3(
      Math.random() * 20 - 10,
      Math.random() * 20 + 10,
      Math.random() * 20 - 10,
    ),
  }));

  return (
    <Canvas>
      <ambientLight />
      <pointLight position={[10, 10, 10]} />
      {boxes.map((box: any, index) => (
        <BoxRain key={index} initPosition={box.position} />
      ))}
    </Canvas>
  );
};

export default BoxRainScene;
