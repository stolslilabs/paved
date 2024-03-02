import { useState, useMemo, useEffect } from "react";
import { Entity } from "@dojoengine/recs";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useDojo } from "../../dojo/useDojo";
import { faCartPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const MAX_TILES = 255;

export const Buy = () => {
  const [quantity, setQuantity] = useState(0);
  const [max, setMax] = useState(0);
  const {
    account: { account },
    setup: {
      clientComponents: { Player },
      systemCalls: { buy },
    },
  } = useDojo();

  const playerKey = useMemo(
    () => getEntityIdFromKeys([BigInt(account.address)]) as Entity,
    [account]
  );
  const player = useComponentValue(Player, playerKey);

  useEffect(() => {
    if (player) setMax(MAX_TILES - player?.bank);
  }, [player, quantity]);

  useEffect(() => {
    // Reset quntity after buying
    if (player) setQuantity(0);
  }, [player]);

  if (!player) return null;

  return (
    <Dialog>
      <DialogTrigger>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={"command"} size={"command"}>
                <FontAwesomeIcon className="h-12" icon={faCartPlus} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="select-none">Purchase menu</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Purchase new tiles</DialogTitle>
          <DialogDescription>
            Enter the quantity you wish to buy (bank cannot exceed {MAX_TILES}).
          </DialogDescription>
        </DialogHeader>

        <div className="w-full flex items-center justify-center gap-4">
          <Input
            className="`grow"
            placeholder="Quantity"
            type="number"
            value={quantity}
            onChange={(e) => {
              if (e.target.value) {
                const value = parseInt(e.target.value);
                if (value > 0 && value < max) {
                  setQuantity(value);
                } else if (value <= 0) {
                  setQuantity(0);
                } else {
                  setQuantity(max);
                }
              } else {
                setQuantity(0);
              }
            }}
          />
          <Button
            variant={"default"}
            size={"icon"}
            className="w-14"
            onClick={() => {
              setQuantity(MAX_TILES - player.bank);
            }}
          >
            Max
          </Button>
        </div>

        {!max && (
          <p className="text-center text-xs text-red-300">Bank limit reached</p>
        )}

        <DialogClose asChild>
          <Button
            disabled={!quantity}
            variant={"default"}
            onClick={() => buy({ account: account, amount: quantity })}
          >
            Confirm
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
};
