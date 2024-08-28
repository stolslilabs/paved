import { useQueryParams } from "./useQueryParams";
import { useEffect, useMemo, useState } from "react";
import { useGame } from "./useGame";
import { TUTORIAL_STAGES } from "@/dojo/game/types/tutorial-stage";
import { useGameStore } from "@/store";

const coordOffset = 2147483647
const sizeOffset = 3

export const useTutorial = () => {

    const { gameId } = useQueryParams();
    const { game } = useGame({ gameId });

    const { x, y } = useGameStore();

    const step = useMemo(() => (game?.built ?? 0) + (game?.discarded ?? 0), [game?.built, game?.discarded])

    const [actionStep, setActionStep] = useState(0)

    const currentTutorialStage = useMemo(() => TUTORIAL_STAGES[step], [step])

    useEffect(() => {
        const normalizedX = (x - coordOffset) * sizeOffset
        const normalizedY = (y - coordOffset) * sizeOffset
        console.log(normalizedX === currentTutorialStage?.markedTile?.x, normalizedY === currentTutorialStage?.markedTile?.y)

    }, [currentTutorialStage?.markedTile?.x, currentTutorialStage?.markedTile?.y, x, y])


    return {
        currentTutorialStage,
        step,
    }
}
