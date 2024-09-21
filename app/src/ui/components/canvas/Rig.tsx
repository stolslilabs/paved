import { useCameraStore } from "@/store";
import {
    OrbitControls,
    PerspectiveCamera,
} from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

export const Rig = () => {
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

    const { camera } = useThree()
    const controls = useRef<OrbitControlsImpl>(null);

    useEffect(() => {
        if (!controls.current) return

        if (reset) {
            controls.current.reset();
            resetAll();
            resetCompassRotation();
        } else if (camera) {
            controls.current.reset();
            resetButPosition();
            resetCompassRotation();
            camera.position.set(...position);
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
                zoom0={0.6}
                minDistance={5}
                maxDistance={30}
                touches={{
                    ONE: THREE.TOUCH.PAN,
                    TWO: THREE.TOUCH.DOLLY_PAN,
                }}
                mouseButtons={{
                    LEFT: THREE.MOUSE.PAN,
                    MIDDLE: THREE.MOUSE.DOLLY,
                    RIGHT: THREE.MOUSE.ROTATE,
                }}
            />
            <PerspectiveCamera
                zoom={zoom}
                rotation={rotation}
                near={near}
                far={far}
            />
        </>
    );
}
