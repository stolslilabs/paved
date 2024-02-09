import * as THREE from "three";
import { useMemo, useRef } from "react";
import { extend, useLoader, useFrame } from "@react-three/fiber";
import { Water } from "three-stdlib";

extend({ Water });

export type Size = {
  x: number;
  y: number;
  l: number;
  w: number;
};

export const Ocean = ({ size }: { size: Size }) => {
  const meshRef = useRef<any>();

  const waterNormals = useLoader(THREE.TextureLoader, "/waternormals.jpeg");
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
  const geom = useMemo(() => new THREE.PlaneGeometry(size.l, size.w), [size]);
  const config = useMemo(
    () => ({
      textureWidth: 512,
      textureHeight: 512,
      waterNormals,
      sunDirection: new THREE.Vector3(),
      sunColor: 0xffffff,
      waterColor: 0xffffff,
      distortionScale: 1.5,
      fog: true,
    }),
    [waterNormals]
  );

  useFrame((_state, delta) => {
    if (meshRef.current?.material?.uniforms?.time) {
      meshRef.current.material.uniforms.time.value += delta / 10; // speed
    }
  });

  return (
    <>
      {/* @ts-ignore */}
      <water
        ref={meshRef}
        args={[geom, config]}
        position={[size.x, size.y, -0.1]}
      />
    </>
  );
};

const calculateRotation = (orientation: any) =>
  (Math.PI / 2) * (1 - orientation);
