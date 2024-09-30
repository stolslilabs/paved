import { useThree } from "@react-three/fiber";
import { Leva, useControls } from "leva";
import { useEffect, useRef } from "react";
import * as THREE from "three"

export const Lighting = () => {
  const lightRef = useRef<THREE.DirectionalLight>(null!);
  const { scene } = useThree()
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

  useEffect(() => {
    if (lightRef.current) {
      const target = new THREE.Object3D();
      target.position.set(-25.5, -40.5, 0);
      lightRef.current.target = target
    }
  }, [])

  useEffect(() => {
    if (lightRef.current) {
      const helper = new THREE.DirectionalLightHelper(lightRef.current, 5);
      scene.add(helper);

      return () => {
        scene.remove(helper);
        helper.dispose();
      };
    }
  }, [scene]);

  return (
    <>
      <Leva
        fill // default = false,  true makes the pane fill the parent dom node it's rendered in
        flat // default = false,  true removes border radius and shadow
        oneLineLabels // default = false, alternative layout for labels, with labels and fields on separate rows
        collapsed // default = false, when true the GUI is collpased
        hidden // default = false, when true the GUI is hidden
      />

      <ambientLight
        intensity={4}
      />
      <directionalLight
        ref={lightRef}
        intensity={10}
        position={[35, 50, 65]} // Adjust the position to represent sunlight direction position
        castShadow
        shadow-mapSize-width={4096} // Increase the shadow map size for better quality shadows
        shadow-mapSize-height={4096}
        shadow-camera-near={1}
        shadow-camera-far={100}
        shadow-camera-left={-50} // Adjust the frustum parameters to increase the coverage area
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      />
    </>
  );
};