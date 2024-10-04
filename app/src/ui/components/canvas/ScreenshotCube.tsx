import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useUIStore } from "@/store";

// TODO: Optimize this component - likely redundant
export const ScreenshotCube = () => {
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

  return <mesh ref={mesh} onClick={takeScreenshot} />;
};
