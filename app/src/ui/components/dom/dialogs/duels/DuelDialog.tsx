import { Button } from "@/ui/elements/button";
import { useDojo } from "@/dojo/useDojo";
import { ModeType } from "@/dojo/game/types/mode";
import { useBuilder } from "@/hooks/useBuilder";
import { useLobby } from "@/hooks/useLobby";
import { AlertDialog, AlertDialogTrigger } from "@/ui/elements/alert-dialog";
import { useMemo, useState } from "react";
import { DuelCreateDialogContent } from "./DuelCreateDialogContent";
import { DuelLobbyDialogContent } from "./DuelLobbyDialogContent";

export const DuelDialog = ({ playerName }: { playerName: string }) => {
    const {
        account: { account },
    } = useDojo();

    const { getBuilder } = useBuilder({})

    const { games } = useLobby();

    const [open, setOpen] = useState(false);

    const isInLobby = useMemo(() => {
        return Object.values(games).find(game => {
            const builder = getBuilder(game.id, account?.address)
            if (!builder) return false

            const idWithinPlayerCount = builder.index < game.player_count
            const isDuel = game.mode.value === ModeType.Duel
            const isActive = builder.score === 1

            return idWithinPlayerCount && isDuel && isActive && game && game.getState() === "lobby"
        });
    }, [account?.address, games, getBuilder])

    return (
        <AlertDialog open={!!isInLobby || open}>
            <AlertDialogTrigger asChild>
                <Button
                    onClick={() => setOpen(true)}
                    className="tracking-[0.25rem] shadow-lg hover:bg-secondary text-xs lg:text-sm px-4 py-4 self-end lg:p-6"
                >
                    New Game
                </Button>
            </AlertDialogTrigger>
            {isInLobby ? <DuelLobbyDialogContent setOpen={setOpen} open={open} game={isInLobby} /> : <DuelCreateDialogContent setOpen={setOpen} playerName={playerName} />}
        </AlertDialog>
    );
};
