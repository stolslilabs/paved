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

export const CreateGame = () => {
  const [gameName, setGameName] = useState("");
  const [endtime, setEndtime] = useState(30);
  const [finishTimeFormat, setFinishTimeFormat] = useState<Date>();

  const {
    account: { account },
    setup: {
      clientComponents: { Player },
      systemCalls: { create_game },
    },
  } = useDojo();

  const playerId = useMemo(
    () => getEntityIdFromKeys([BigInt(account.address)]) as Entity,
    [account]
  );
  const player = useComponentValue(Player, playerId);

  useEffect(() => {
    const interval = setInterval(() => {
      setFinishTimeFormat(
        new Date(endtime * 60 * 1000 + Math.floor(Date.now()))
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [endtime]);

  const handleClick = () => {
    create_game({
      account: account,
      name: shortString.encodeShortString(gameName),
      endtime: endtime === 0 ? 0 : endtime * 60 + Math.floor(Date.now() / 1000),
    });
  };

  return (
    <Dialog>
      <DialogTrigger>
        <Button disabled={!player} variant={"secondary"}>
          Create
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a game</DialogTitle>
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
          value={endtime}
          onChange={(e) => {
            if (e.target.value) {
              setEndtime(parseInt(e.target.value));
            } else {
              setEndtime(0);
            }
          }}
        />

        <Label className="text-xs">
          End at: {finishTimeFormat?.toLocaleString()}
        </Label>

        <DialogClose asChild>
          <Button
            disabled={!player || !gameName || !endtime}
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
