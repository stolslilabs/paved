import { ModeType } from "@/dojo/game/types/mode";
import { useGame } from "@/hooks/useGame";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useTutorial } from "@/hooks/useTutorial";
import {
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/ui/elements/alert-dialog";
import { useNavigate } from "react-router-dom";

export const TutorialCompleteDialog = () => {
  const { gameId } = useQueryParams();
  const { game } = useGame({ gameId });

  const { step, maxSteps } = useTutorial();

  const navigate = useNavigate();

  const handleClick = () => navigate("/", { replace: true });

  return (
    game?.mode.value === ModeType.Tutorial && (
      <AlertDialog open={step === maxSteps}>
        <AlertDialogContent className="bg-primary">
          <AlertDialogHeader>
            <AlertDialogTitle>Tutorial Complete!</AlertDialogTitle>
            <AlertDialogDescription>
              Congratulations on completing the Paved tutorial!
              <br />
              You are now ready to play a full game of Paved!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleClick} className="bg-secondary">
              Return to Lobby
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  );
};
