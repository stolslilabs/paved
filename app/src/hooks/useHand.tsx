import { useGameStore } from "@/store";
import RotationSound from "/sounds/effects/rotation.wav";
import useSound from "use-sound";

export const useHand = () => {
    const [play] = useSound(RotationSound);

    const { orientation, setOrientation, strategyMode, setStrategyMode } =
        useGameStore();

    const rotateHand = () => { play(); setOrientation(orientation + 1); }
    const counterRotateHand = () => { play(); setOrientation(orientation - 1); }
    const toggleStrategyMode = () => { setStrategyMode(!strategyMode) }

    return { rotateHand, counterRotateHand, toggleStrategyMode }
}