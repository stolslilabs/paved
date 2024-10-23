import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/elements/table";
import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";

import { useDojo } from "@/dojo/useDojo";
import { useNavigate } from "react-router-dom";

import { useBuilder } from "@/hooks/useBuilder";
import { Game } from "@/dojo/game/models/game";
import { useLobby } from "@/hooks/useLobby";
import viewMapIcon from "/assets/icons/viewmap.svg";
import { Mode, ModeType } from "@/dojo/game/types/mode";
import blobert from "/assets/blobert.svg";
import { CreateGame } from "../components/CreateGame";
import { ComponentValue, Schema } from "@dojoengine/recs";
import { Dialog, DialogTrigger } from "@radix-ui/react-dialog";
import { DuelJoinDialogContent } from "../components/dom/dialogs/duels/DuelJoinDialogContent";
import { formatTime, formatTimeUntil } from "@/utils/time";
import { useBuilders } from "@/hooks/useBuilders";
import { cn } from "../utils";

export type GamesList = { [key: number]: ComponentValue<Schema, Game>; }

const tableHeaders = {
  [ModeType.None]: [],
  [ModeType.Tutorial]: [],
  [ModeType.Daily]: ["Game", "Rank", "Score", "Time Elapsed"],
  [ModeType.Weekly]: ["Game", "Rank", "Score", "Time Elapsed"],
  [ModeType.Duel]: ["Name", "Game Length", "Time Elapsed", "Tiles Played", "Buy-in"]
}

export const Games = ({ games }: { games: GamesList }) => {
  const { gameMode } = useLobby();

  const filteredGames: ComponentValue<Schema, Game>[] = useMemo(
    () =>
      Object.values(games)
        .filter((game) => {
          if (game.mode.value !== gameMode.value) return false;
          if (game.score > 0) return true;
          return !game.isOver();
        })
        .sort((a, b) => b.id - a.id),
    [games, gameMode],
  );

  return gameMode.value !== ModeType.Tutorial ? (
    <Table className="mb-4">
      <TableHeader>
        <TableRow className="text-2xs lg:text-xs">
          {tableHeaders[gameMode.value].map((header, index) => (
            <TableHead className={cn("text-center uppercase h-6 lg:h-10 pt-8 pb-2", index === 0 && " text-start")} key={index}>
              {header}
            </TableHead>
          ))}
          <TableHead className="w-60" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.values(filteredGames).map((game, index) => gameMode.value === ModeType.Duel ? (
          <DuelLobbyRow key={index} game={game} />
        ) : (
          <GameSingleRow key={index} game={game} />
        ))}
      </TableBody>
    </Table>
  ) : (
    <StartTutorialContent />
  );
};

const StartTutorialContent = () => {
  return (
    <div className="flex flex-col sm:flex-row md:flex-col items-center justify-center h-full gap-8 sm:gap-4 lg:gap-8 p-4">
      <img src={blobert} className="width-full sm:w-1/2" />
      <CreateGame mode={new Mode(ModeType.Tutorial)} />
    </div>
  );
};

const DuelLobbyRow = ({ game }: { game: ComponentValue<Schema, Game> }) => {
  const now = new Date();

  const timeLeftText = !game.start_time.getTime() ? "Lobby" :
    game.getEndDate() < now ? "Ended" :
      formatTimeUntil(game.getEndDate());

  const lengthDate = new Date(Date.now() + Number(game.duration) * 1000);

  return (
    <TableRow className="text-2xs sm:text-sm text-center">
      <TableCell> {/* Name */}
        <p className="text-start">{game.name}</p>
      </TableCell>
      <TableCell> {/* Game Length */}
        <p className="text-center">{`${formatTimeUntil(lengthDate)}` || "N/A"}</p>
      </TableCell>
      <TableCell> {/* Time Left */}
        <p className="text-center">{timeLeftText}</p>
      </TableCell>
      <TableCell> {/* Played tiles */}
        <p className="text-center">{game.tile_count || "N/A"}</p>
      </TableCell>
      <TableCell> {/* Buy-in */}
        <p className="text-center">{`${Number(game.price) / 1e18 || "0"}`}</p>
      </TableCell>
      <TableCell> {/* Button */}
        <DuelLobbyRowButton game={game} />
      </TableCell>
    </TableRow>
  )
}

const DuelLobbyRowButton = ({ game }: { game: ComponentValue<Schema, Game> }) => {
  const {
    account: { account },
    setup: {
      systemCalls: { claim_duel_prize },
    },
  } = useDojo();

  const navigate = useNavigate();

  const { builders } = useBuilders({ gameId: game.id })
  const { builder } = useBuilder({ gameId: game.id, playerId: account?.address })

  const handleResume = () => navigate("?id=" + game.id, { replace: true })

  const [loading, setLoading] = useState(false)

  const handleClaim = useCallback(async () => {
    setLoading(true)
    await claim_duel_prize({
      account: account,
      mode: new Mode(ModeType.Duel),
      game_id: game.id
    }).catch((error) => console.error(error))
      .finally(() => setLoading(false))
  }, [account, claim_duel_prize, game.id])

  const isLobby = useMemo(() => game.getState() === "lobby", [game])
  const isHost = useMemo(() => builder?.index === 0, [builder?.index])
  const isOver = useMemo(() => game.getState() === "over", [game])
  const isOngoing = useMemo(() => game.getState() === "started", [game])
  const isParticipating = useMemo(() => (builder?.score ?? 0) >= 1, [builder?.score])
  const isFull = useMemo(() => builders.filter(builder => builder.score >= 1).length >= 2, [builders]);
  const isClaimable = useMemo(() => !game.claimed && isOver, [game.claimed, isOver])
  const isWinner = useMemo(() => {
    if (!builder || !builders.length) return false;

    // Find the highest score
    const highestScore = Math.max(...builders.map(b => b.score));

    // Check if the current builder has the highest score
    if (builder.score === highestScore) {
      // If scores are equal, check if the builder's index is not 0
      if (builder.score === highestScore && builder.index !== 0) {
        return true;
      }
      // If scores are equal and index is 0, check if it's the only highest score
      return builders.filter(b => b.score === highestScore).length === 1;
    }

    return false;
  }, [builder, builders]);

  if (isLobby && !isHost)
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button className="py-2 w-36">Join</Button>
        </DialogTrigger>
        <DuelJoinDialogContent game={game} />
      </Dialog>
    )

  if (isOngoing && isParticipating) {
    return (
      <Button className="py-2 w-36" onClick={handleResume}>Resume</Button>
    )
  }

  if (isFull && !isParticipating) {
    <p>Full</p>
  }

  if (isOver && isParticipating && !isLobby && isWinner) {
    return isClaimable ? (
      <Button className="py-2 w-36" disabled={loading} loading={loading} onClick={handleClaim}>Claim</Button>
    ) : (
      <Button className="py-2 w-36" disabled={true}>Claimed</Button>
    )
  }
}

export const GameSingleRow = ({ game }: { game: ComponentValue<Schema, Game> }) => {
  const [score, setScore] = useState<number>();
  const [over, setOver] = useState<boolean>(false);
  // const { account } = useAccount();
  const {
    account: { account },
  } = useDojo();

  const { builder } = useBuilder({
    gameId: game?.id,
    playerId: account?.address,
  });

  useEffect(() => {
    if (game && builder) {
      setScore(game.score);
      setOver(game.isOver());
    }
  }, [game, builder]);

  const navigate = useNavigate();

  const setGameQueryParam = useMemo(() => {
    return (id: string) => {
      navigate("?id=" + id, { replace: true });
    };
  }, [navigate]);

  const date = new Date(game.start_time);

  if (!game || !builder) return null;

  return (
    <TableRow className="text-2xs sm:text-xs text-center">
      <TableCell>#{game.id}</TableCell>
      <TableCell>1</TableCell>
      <TableCell>{score}</TableCell>
      <TableCell>{formatTime(date) ?? "N/A"}</TableCell>

      <TableCell className="flex justify-end">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size={"sm"}
                className={`px-1 sm:px-4 flex gap-3 self-end h-8 w-19 text-2xs sm:text-xs hover:bg-transparent ${over ? "border-none" : "border-2"}`}
                variant={over ? "ghost" : "default"}
                onClick={() => setGameQueryParam(String(game.id || 0))}
              >
                {over ? (
                  <img className="h-6 w-10 " src={viewMapIcon} />
                ) : (
                  "Play"
                )}
              </Button>
            </TooltipTrigger>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
};
