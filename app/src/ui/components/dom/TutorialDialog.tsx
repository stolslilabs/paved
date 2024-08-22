import { useTutorial } from "@/hooks/useTutorial"

export const TutorialDialog = () => {
    const { step } = useTutorial()
    return (
        <div id="tutorial-dialog" className="h-full w-full self-end bg-gray-300 rounded p-2 z-40 pointer-events-auto">
            {/* Add your tutorial content here */}
            <h4 className="font-bold text-sm m-0 mb-1">Tutorial</h4>
            <p className="text-xs tracking-tighter">
                FADED TILE AND HIGHLIGHTED AREAS FOR TUTORIAL
                PURPOSES ONLY. PLEASE FOLLOW INSTRUCTIONS TO MOVE TO
                THE NEXT STEPS.
            </p>
        </div>
    )
}