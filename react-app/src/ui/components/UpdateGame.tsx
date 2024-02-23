import { useDojo } from "../../dojo/useDojo";
import { shortString } from "starknet";
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

import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useComponentValue } from "@dojoengine/react";
import { useMemo, useEffect } from "react";
import { useQueryParams } from "@/hooks/useQueryParams";

export const UpdateGame = () => {
  const { gameId } = useQueryParams();
  const [gameName, setGameName] = useState("");
  const [duration, setDuration] = useState(30);
  const [finishTimeFormat, setFinishTimeFormat] = useState<string>();
  const [disabled, setDisabled] = useState(true);

  const {
    account: { account },
    setup: {
      clientComponents: { Game, Player },
      systemCalls: { rename_game, update_game },
    },
  } = useDojo();

  const gameKey = useMemo(
    () => getEntityIdFromKeys([BigInt(gameId)]),
    [gameId]
  );
  const game = useComponentValue(Game, gameKey);
  const playerId = useMemo(
    () => getEntityIdFromKeys([BigInt(account.address)]) as Entity,
    [account]
  );
  const player = useComponentValue(Player, playerId);

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

  useEffect(() => {
    if (game && player) {
      setGameName(shortString.decodeShortString(game.name));
      setDuration(game.duration / 60);
      setDisabled(game.host !== player.id);
    }
  }, [game, player]);

  const handleClick = () => {
    const name = shortString.decodeShortString(game?.name);
    if (name !== gameName) {
      rename_game({
        account: account,
        game_id: gameId,
        name: shortString.encodeShortString(gameName),
      });
    }
    if (game && duration * 60 !== game.duration) {
      update_game({
        account: account,
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
            Choose a name and set the end time (from now in minutes).
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
