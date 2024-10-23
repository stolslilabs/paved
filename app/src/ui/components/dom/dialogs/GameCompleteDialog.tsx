import { ModeType } from "@/dojo/game/types/mode";
import { useDojo } from "@/dojo/useDojo";
import { useBuilders } from "@/hooks/useBuilders";
import { useGame } from "@/hooks/useGame";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useTutorial } from "@/hooks/useTutorial";
import { useUIStore } from "@/store";
import {
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/ui/elements/alert-dialog";
import { Button } from "@/ui/elements/button";
import { faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Game as GameClass } from "@/dojo/game/models/game";
import { TwitterShareButton } from "react-share";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui/elements/dialog";
import { Leaderboard } from "../../Leaderboard";
import { useBuilder } from "@/hooks/useBuilder";

export const GameCompletedDialog = () => {
  const { gameId } = useQueryParams();
  const { game } = useGame({ gameId });

  return game?.mode.value === ModeType.Tutorial ? (
    <TutorialDialog />
  ) : (
    <RegularDialog />
  );
};

const TutorialDialog = () => {
  const { step, maxSteps } = useTutorial();

  const navigate = useNavigate();

  const handleClick = () => navigate("/", { replace: true });

  return (
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
  );
};

const RegularDialog = () => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
  } = useDojo();
  const { game } = useGame({ gameId });
  const { builders } = useBuilders({ gameId });
  const [open, setOpen] = useState(true);
  const [duelOver, setDuelOver] = useState(false)

  const isSelf = useMemo(
    () =>
      account?.address ===
      (builders.length > 0 ? builders[0].player_id : "0x0"),
    [account, builders],
  );

  useEffect(() => {
    if (!game || game.mode.value !== ModeType.Duel) return;

    const tick = setInterval(() => {
      if (Date.now() > game.getEndDate().getTime()) {
        setDuelOver(true)
        clearInterval(tick)
      }
    }, 1000)

    return () => clearInterval(tick)
  }, [game])

  if (!game || !builders || !builders.length) return null;

  return (
    <Dialog open={open && ((game.isOver() && isSelf) || duelOver)} onOpenChange={setOpen}>
      <DialogContent className="bg-primary">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">Leaderboard</DialogTitle>
        </DialogHeader>
        <Description game={game} />
        <Leaderboard builders={builders} />
      </DialogContent>
    </Dialog>
  );
};

const Description = ({ game }: { game: GameClass }) => {
  const {
    account: { account },
  } = useDojo();

  const takeScreenshot = useUIStore((state) => state.takeScreenshot);
  const [screenshotMessage, setScreenshotMessage] = useState("");
  const { builder } = useBuilder({ gameId: game.id, playerId: account?.address })
  const navigate = useNavigate()

  const handleScreenshot = () => {
    takeScreenshot?.();
    setScreenshotMessage("Shot taken!");
    setTimeout(() => setScreenshotMessage(""), 5000);
  };

  return (
    <DialogDescription className="flex justify-center items-center gap-3 text-xs flex-wrap">
      <div className="w-full text-center text-3xl">PUZZLE COMPLETE!</div>
      <div className="w-full text-center">
        Well paved, adventurer ⚒️ <br />
        Care to flex your score on X? <br /> Tip: paste your screenshot into the
        post for maximum impact.
      </div>

      <Button className="flex gap-2 w-auto p-2 text-xs" onClick={() => navigate("", { replace: true })}>Home</Button>
      <Button
        variant={"default"}
        size={"icon"}
        className="flex gap-2 w-auto p-2 text-xs"
        onClick={handleScreenshot}
      >
        {screenshotMessage ? screenshotMessage : "Take Screenshot!"}
      </Button>

      <Share score={builder?.score ?? 0} />
    </DialogDescription>
  );
};

const Share = ({ score }: { score: number }) => {
  return (
    <TwitterShareButton
      url="https://sepolia.paved.gg/"
      title={`I just conquered today’s @pavedgame puzzle 🧩

Score: ${score}

Think you can do better? Join the fun at https://sepolia.paved.gg/ and #paveyourwaytovictory in an onchain strategy game like no other ⚒️ 

Play now 👇
`}
    >
      <Button
        className="flex gap-2 w-auto p-2 text-xs"
        variant={"default"}
        size={"icon"}
      >
        <FontAwesomeIcon icon={faXTwitter} />
        <p>Share</p>
      </Button>
    </TwitterShareButton>
  );
};
