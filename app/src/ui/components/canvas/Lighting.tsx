import { Leva, useControls } from "leva";

export const Lighting = () => {
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
