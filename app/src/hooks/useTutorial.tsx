export const useTutorial = () => {
    const firstStep = 1
    const maxSteps = 5

    const getCurrentStep = () => localStorage.getItem('tutorialStep');

    return {
        getCurrentStep
    }
}