import {
    Bloom,
    EffectComposer,
    Vignette,
    N8AO,
} from "@react-three/postprocessing";
import { useControls } from "leva";


export const Postprocessing = () => {
    const { distanceFalloff, aoRadius, intensity } = useControls(
        "Postprocessing",
        {
            distanceFalloff: {
                value: 2,
                min: 0,
                max: 5,
                step: 0.01,
            },
            aoRadius: {
                value: 2,
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
            <N8AO distanceFalloff={distanceFalloff} aoRadius={aoRadius} intensity={intensity} quality="ultra" />
        </EffectComposer>
    );
};