import { useDojo } from "../../dojo/useDojo";
import { Account, shortString } from "starknet";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { useState, useEffect } from "react";
import { usePlayer } from "@/hooks/usePlayer";

export const CreateMultiGame = () => {
  const [gameName, setGameName] = useState("");
  const [duration, setDuration] = useState(30);
  const [finishTimeFormat, setFinishTimeFormat] = useState<string>();

  const {
    account: { account },
    setup: {
      systemCalls: { create_game },
    },
  } = useDojo();

  const { player } = usePlayer({ playerId: account?.address });

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

  const handleClick = () => {
    if (!player) return;
    create_game({
      account: account as Account,
      name: shortString.encodeShortString(gameName),
      duration: duration * 60,
      mode: 2,
    });
  };

  return (
    <Dialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger disabled={!player}>
              <Button disabled={!player} variant={"secondary"}>
                New Game
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p className="select-none">Create a multiplayer game</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a game</DialogTitle>
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
            Create
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
};
