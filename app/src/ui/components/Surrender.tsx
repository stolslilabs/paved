import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/ui/elements/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { Button } from "@/ui/elements/button";
import { useMemo } from "react";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useDojo } from "../../dojo/useDojo";
import { useQueryParams } from "@/hooks/useQueryParams";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFontAwesome } from "@fortawesome/free-solid-svg-icons";
import { Account } from "starknet";
import { useGame } from "@/hooks/useGame";
import { useBuilder } from "@/hooks/useBuilder";
import { useAccount } from "@starknet-react/core";

interface TProps {}

export const Surrender = (props: TProps) => {
  const { gameId } = useQueryParams();
  const { account } = useAccount();
  const {
    setup: {
      systemCalls: { surrender },
    },
  } = useDojo();

  const { game } = useGame({ gameId });
  const { builder } = useBuilder({ gameId, playerId: account?.address });

  const disabled = useMemo(() => {
    return !!game?.over;
  }, [game]);

  if (!account || !game || !builder) return <></>;

  return (
    <AlertDialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <AlertDialogTrigger asChild>
              <Button disabled={disabled} variant={"command"} size={"command"}>
                <FontAwesomeIcon
                  className="sm:h-4 md:h-12"
                  icon={faFontAwesome}
                />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p className="select-none">Surrender</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Surrender?</AlertDialogTitle>
          <AlertDialogDescription>
            <div className="flex flex-col gap-4">
              <p>You are about to surrender, this action cannot be undone.</p>
              <p>Your score will be submitted and the game will be over.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              surrender({
                account: account as Account,
                game_id: gameId,
              });
            }}
          >
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
