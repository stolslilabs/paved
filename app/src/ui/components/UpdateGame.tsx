import { useDojo } from "../../dojo/useDojo";
import { Account, shortString } from "starknet";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useMemo, useEffect } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useGame } from "@/hooks/useGame";
import { usePlayer } from "@/hooks/usePlayer";
import { useBuilder } from "@/hooks/useBuilder";

export const UpdateGame = () => {
  const { gameId } = useQueryParams();
  const [gameName, setGameName] = useState("");
  const [duration, setDuration] = useState(30);
  const [finishTimeFormat, setFinishTimeFormat] = useState<string>();

  const {
    account: { account },
    setup: {
      systemCalls: { rename_game, update_game },
    },
  } = useDojo();

  const { game } = useGame({ gameId });
  const { player } = usePlayer({ playerId: account?.address });
  const { builder } = useBuilder({
    gameId: gameId,
    playerId: account?.address,
  });

  useEffect(() => {
    if (duration) {
      const interval = setInterval(() => {
        const date = new Date(duration * 60 * 1000 + Math.floor(Date.now()));
        setFinishTimeFormat(date.toLocaleString());
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setFinishTimeFormat("");
    }
  }, [duration]);

  const disabled = useMemo(() => !builder || builder.index !== 0, [builder]);

  useEffect(() => {
    if (game && player) {
      setGameName(shortString.decodeShortString(game.name));
      setDuration(game.duration / 60);
    }
  }, [game, player]);

  const handleClick = () => {
    if (!game || !player) return;
    const name = shortString.decodeShortString(game.name);
    if (name !== gameName) {
      rename_game({
        account: account as Account,
        game_id: gameId,
        name: shortString.encodeShortString(gameName),
      });
    }
    if (game && duration * 60 !== game.duration) {
      update_game({
        account: account as Account,
        game_id: gameId,
        duration: duration * 60,
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger>
        <Button disabled={disabled} variant={"secondary"}>
          Update
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update a game</DialogTitle>
          <DialogDescription>
            Choose a name and set the duration (in minutes).
          </DialogDescription>
        </DialogHeader>

        <Input
          disabled={!player}
          placeholder="Game Name"
          type="text"
          value={gameName}
          onChange={(e) => {
            setGameName(e.target.value);
          }}
        />

        <Input
          disabled={!player}
          type="number"
          value={duration}
          onChange={(e) => {
            if (e.target.value) {
              setDuration(parseInt(e.target.value));
            } else {
              setDuration(0);
            }
          }}
        />

        {!!finishTimeFormat && (
          <Label className="text-xs">End at: {finishTimeFormat}</Label>
        )}

        <DialogClose asChild>
          <Button
            disabled={!player || !gameName}
            variant={"default"}
            onClick={handleClick}
          >
            Update
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
};
