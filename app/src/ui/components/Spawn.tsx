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
} from "@/ui/elements/dialog";
import { Button } from "@/ui/elements/button";
import { Input } from "@/ui/elements/input";
import { useMemo, useEffect } from "react";
import { useAccount } from "@starknet-react/core";
import { usePlayer } from "@/hooks/usePlayer";

export const Spawn = ({
  loading,
  setLoading,
}: {
  loading: boolean;
  setLoading: (value: boolean) => void;
}) => {
  // const { account } = useAccount();
  const [playerName, setPlayerName] = useState("");

  const {
    account: { account },
    setup: {
      config: { masterAddress },
      systemCalls: { create_player },
    },
  } = useDojo();

  const { player } = usePlayer({ playerId: account?.address });

  const disabled = useMemo(() => {
    return !!player || !account || loading;
  }, [player, account, masterAddress, loading]);

  useEffect(() => {
    if (player) {
      setPlayerName(player.name);
      setLoading(false);
    } else {
      setPlayerName("");
    }
  }, [player]);

  const handleClick = async () => {
    setLoading(true);
    if (account) {
      await create_player({
        account: account as Account,
        name: shortString.encodeShortString(playerName),
        master: account.address,
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={disabled} variant={"secondary"}>
          {loading ? "Spawning..." : "Spawn"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a player</DialogTitle>
          <DialogDescription>Choose a player name.</DialogDescription>
        </DialogHeader>

        <Input
          className="`w-20"
          disabled={!!player}
          placeholder="Player Name"
          type="text"
          value={playerName}
          onChange={(e) => {
            setPlayerName(e.target.value);
          }}
        />

        <DialogClose asChild>
          <Button
            disabled={!!player || !playerName}
            variant={"default"}
            onClick={handleClick}
          >
            Spawn
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
};
