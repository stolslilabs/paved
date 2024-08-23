import { useQueryParams } from "./useQueryParams";
import { useMemo } from "react";
import { useGame } from "./useGame";
import { TUTORIAL_STAGES } from "@/dojo/game/types/tutorial-stage";

export const useTutorial = () => {
    const { gameId } = useQueryParams();
    const { game } = useGame({ gameId });

    const step = useMemo(() => (game?.built ?? 0) + (game?.discarded ?? 0), [game?.built, game?.discarded])

    const currentTutorialStage = () => TUTORIAL_STAGES[step]

    return {
        currentTutorialStage,
        step,
    }
}

export function comparePartials<T, U>(obj1: Partial<T>, obj2: U): boolean {
    for (const key of Object.keys(obj1) as Array<keyof T & keyof U>) {
        if (obj1[key] !== obj2[key]) {
            console.log("Mismatch:", key, obj1[key], obj2[key])
            return false;
        }
    }
    return true;
}
