import { useQueryParams } from "./useQueryParams";
import { useMemo } from "react";
import { useGame } from "./useGame";
import { TUTORIAL_STAGES } from "@/dojo/game/types/tutorial-stage";

export const useTutorial = () => {
    const { gameId } = useQueryParams();
    const { game } = useGame({ gameId });

    const step = useMemo(() => (game?.built ?? 0) + (game?.discarded ?? 0), [game?.built, game?.discarded])
    const maxSteps = 8

    const currentTutorialStage = useMemo(() => TUTORIAL_STAGES[step], [step])

    return {
        currentTutorialStage,
        step,
        maxSteps
    }
}
