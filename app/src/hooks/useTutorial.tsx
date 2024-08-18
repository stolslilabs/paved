import { useQueryParams } from "./useQueryParams";

// TODO: Clear on controller version bump 
export const useTutorial = () => {
    const { gameId } = useQueryParams();

    const firstStep = 1
    const maxSteps = 5

    const getCurrentStep = () => localStorage.getItem(`tutorial-${gameId}`);

    return {
        getCurrentStep
    }
}