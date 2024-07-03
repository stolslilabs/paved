import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTrigger,
} from "@/ui/elements/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/elements/table";

import { Button } from "@/ui/elements/button";

import { useState, useEffect, useMemo, ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrophy } from "@fortawesome/free-solid-svg-icons";
import { useQueryParams } from "@/hooks/useQueryParams";
import { getColor } from "@/dojo/game";
import { TwitterShareButton } from "react-share";
import { faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { useGame } from "@/hooks/useGame";
import { usePlayer } from "@/hooks/usePlayer";
import { Game as GameClass } from "@/dojo/game/models/game";
import { ToolTipButton } from "./ToolTipButton";
import { useBuilders } from "@/hooks/useBuilders";
import { useDojo } from "@/dojo/useDojo";
import leaderboard from "/assets/icons/LEADERBOARD.svg";
import { useUIStore } from "@/store";

export const LeaderboardDialog = ({ children }: { children?: ReactNode }) => {
  const { gameId } = useQueryParams();
  const {
    account: { account },
  } = useDojo();
  const { game } = useGame({ gameId });
  const { builders } = useBuilders({ gameId });
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);

  const isSelf = useMemo(() => {
    return (
      account?.address === (builders.length > 0 ? builders[0].player_id : "0x0")
    );
  }, [account, builders, over, game]);

  useEffect(() => {
    if (game) {
      const interval = setInterval(() => {
        if (!over && game.isOver() && isSelf) {
          setOpen(true);
          setOver(true);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [game, over]);

  if (!game || !builders || !builders.length) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        {children ?? (
          <ToolTipButton
            icon={
              <img src={leaderboard} className="h-8 sm:h-4 md:h-8  fill-current" />
            }
            toolTipText="Leaderboard"
          />
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="flex items-center">Leaderboard</DialogHeader>
        {over && isSelf && <Description game={game} />}
        <Leaderboard game={game} builders={builders} />
      </DialogContent>
    </Dialog>
  );
};

export const Description = ({ game }: { game: GameClass }) => {
  const takeScreenshot = useUIStore((state) => state.takeScreenshot);
  const [screenshotMessage, setScreenshotMessage] = useState("");

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

      <Button
        variant={"default"}
        size={"icon"}
        className="flex gap-2 w-auto p-2 text-xs"
        onClick={handleScreenshot}
      >
        {screenshotMessage ? screenshotMessage : "Take Screenshot!"}
      </Button>

      <Share score={game.score} />
    </DialogDescription>
  );
};

export const Share = ({ score }: { score: number }) => {
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

export const Leaderboard = ({
  game,
  builders,
}: {
  game: any;
  builders: any[];
}) => {
  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Rank</TableHead>
          <TableHead className="w-[100px]">Score</TableHead>
          <TableHead>Name</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <PlayerRow rank={1} score={game?.score || 0} builder={builders[0]} />
      </TableBody>
    </Table>
  );
};

export const PlayerRow = ({
  rank,
  score,
  builder,
}: {
  rank: number;
  score: number;
  builder: any;
}) => {
  const { player } = usePlayer({ playerId: builder.player_id });
  const name = player?.name || "";
  const backgroundColor = useMemo(
    () => getColor(`0x${builder.player_id.toString(16)}`),
    [builder],
  );

  return (
    <TableRow>
      <TableCell className="">{rank}</TableCell>
      <TableCell>{score}</TableCell>
      <TableCell className="flex gap-2 text-ellipsis">
        <div className="rounded-full w-4 h-4" style={{ backgroundColor }} />
        {name}
      </TableCell>
    </TableRow>
  );
};
