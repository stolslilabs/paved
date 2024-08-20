import { ModeType } from "@/dojo/game/types/mode";
import { useLobby } from "./useLobby";
import { useQueryParams } from "./useQueryParams";
import { useEffect, useState } from "react";


const markedTiles = [
    { x: -3, y: 0 },
    { x: -3, y: -3 },
    { x: -3, y: -6 },
    { x: 0, y: -3 },
    { x: 0, y: -6 },
    { x: 3, y: -6 },
    { x: 3, y: -3 },
    { x: 3, y: 0 },
]

const firstStep = 0
const maxSteps = 9

// TODO: Clear on controller version bump 
export const useTutorial = () => {
    const { gameId } = useQueryParams();
    const { gameMode } = useLobby();

    const [step, setStep] = useState(firstStep)

    useEffect(() => {
        const handleTutorialAdvance = (e: CustomEvent<number>) => {
            setStep(e.detail)
        }

        window.addEventListener('tutorial-advance', handleTutorialAdvance as EventListener)

        return () => {
            window.removeEventListener('tutorial-advance', handleTutorialAdvance as EventListener)
        }
    }, [])


    const getCurrentStep = () => localStorage.getItem(`tutorial-${gameId}`) ?? '0';

    const currentStepTile = () => markedTiles[parseInt(getCurrentStep())]

    const advanceStep = () => {
        if (gameMode.value !== ModeType.Tutorial) return

        localStorage.setItem(`tutorial-${gameId}`, step.toString())

        dispatchEvent(new CustomEvent('tutorial-advance', { detail: step + 1 }));
    }

    return {
        getCurrentStep,
        currentStepTile,
        advanceStep,
        firstStep,
        maxSteps
    }
}