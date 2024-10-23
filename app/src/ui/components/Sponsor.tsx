import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/ui/elements/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { Input } from "@/ui/elements/input";
import { Button } from "@/ui/elements/button";
import { useTournament } from "@/hooks/useTournament";
import { useEffect, useMemo, useState } from "react";
import { Lords } from "./Lords";
import { Mode } from "@/dojo/game/types/mode";
import { useDojo } from "@/dojo/useDojo";
import { Account } from "starknet";

export const Sponsor = ({
  tournamentId,
  mode,
}: {
  tournamentId: number;
  mode: Mode;
}) => {
  const [amount, setAmount] = useState(0);
  const [prize, setPrize] = useState<number>();
  const { tournament } = useTournament({
    tournamentId: tournamentId,
  });

  useEffect(() => {
    if (tournament) {
      setPrize(Number(tournament.prize) / 1e18);
    } else {
      setPrize(0);
    }
  }, [tournament]);

  const {
    account: { account },
    setup: {
      systemCalls: { sponsor },
    },
  } = useDojo();

  const disabled = useMemo(() => {
    return !tournament?.isCurrent(mode);
  }, [tournament]);

  const handleClick = () => {
    if (account) {
      sponsor({
        account: account as Account,
        amount: `0x${(BigInt(amount) * BigInt(1e18)).toString(16)}`,
        mode: mode,
      });
    }
  };

  const backgroundColor = useMemo(() => {
    return "#111827";
  }, []);

  return (
    <Dialog>
      <DialogTrigger disabled={disabled}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="flex justify-between items-center gap-4 text-white py-2 px-16"
              style={{ backgroundColor }}
            >
              <Lords fill={"white"} />
              <div className="flex flex-col justify-center items-center text-xl gap-1">
                <p className="text-xs">Lords Pool</p>
                <p className="text-xl">{`${prize}`}</p>
              </div>
              <Lords fill={"white"} />
            </div>
          </TooltipTrigger>
          <TooltipContent className={disabled ? "hidden" : ""}>
            <p className="select-none">Sponsor</p>
          </TooltipContent>
        </Tooltip>
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-scroll">
        <DialogHeader>
          <DialogTitle>Sponsor the tournament</DialogTitle>
          <DialogDescription className="flex gap-2">
            Amount
            <span className="flex space-x-2">
              [<Lords height={4} width={4} fill={""} />]
            </span>
          </DialogDescription>
        </DialogHeader>

        <Input
          className="`w-20"
          placeholder="Player Name"
          type="number"
          value={amount}
          onChange={(e) => {
            setAmount(parseInt(e.target.value));
          }}
        />

        <DialogClose asChild>
          <Button
            disabled={amount === 0}
            variant={"default"}
            onClick={handleClick}
          >
            Pay
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
};
