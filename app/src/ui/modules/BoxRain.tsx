import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Vector3 } from "three";

// Updated BoxRain component to accept a color prop
const BoxRain = ({
  initPosition,
  color,
}: {
  initPosition: Vector3;
  color: string;
}) => {
  const meshRef = useRef<any>();

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.y -= 0.1;
      meshRef.current.rotation.x += 0.01;
      meshRef.current.rotation.y += 0.001;

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
      <meshStandardMaterial color={color} /> {/* Use the color prop here */}
    </mesh>
  );
};

const BoxRainScene = () => {
  const boxes = useMemo(
    () =>
      Array.from({ length: 100 }, () => ({
        position: new Vector3(
          Math.random() * 20 - 10,
          Math.random() * 20 + 10,
          Math.random() * 20 - 10
        ),
        // Generate a random color for each box
        color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
      })),
    []
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
        <BoxRain key={index} initPosition={box.position} color={box.color} />
      ))}
    </Canvas>
  );
};

export default BoxRainScene;
