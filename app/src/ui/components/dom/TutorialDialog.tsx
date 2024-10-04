import { ModeType } from "@/dojo/game/types/mode";
import { useGame } from "@/hooks/useGame";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useTutorial } from "@/hooks/useTutorial";

export const TutorialDialog = () => {
  const { gameId } = useQueryParams();
  const { game } = useGame({ gameId });

  const { currentTutorialStage } = useTutorial();

  return (
    currentTutorialStage?.textboxText &&
    game?.mode.value === ModeType.Tutorial && (
      <div
        id="tutorial-dialog"
        className="h-full w-full self-end bg-gray-300 rounded p-2 z-40 pointer-events-auto hidden sm:block"
      >
        {/* Add your tutorial content here */}
        <h4 className="font-bold text-sm m-0 mb-1">Tips</h4>
        <p className="text-xs tracking-tighter">
          {currentTutorialStage?.textboxText ?? ""}
        </p>
      </div>
    )
  );
};
