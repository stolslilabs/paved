import { Button } from "@/ui/elements/button";
import { useDojo } from "@/dojo/useDojo";
import { Mode, ModeType } from "@/dojo/game/types/mode";
import { ComponentValue, Schema } from "@dojoengine/recs";
import { Game } from "@/dojo/game/models/game";
import { AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/ui/elements/alert-dialog";
import { useCallback, useMemo, useState } from "react";
import { Input } from "@/ui/elements/input";
import { useBuilders } from "@/hooks/useBuilders";
import { toast } from "sonner";
import { formatTime } from "@/utils/time";
import { useBuilder } from "@/hooks/useBuilder";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { cn } from "@/ui/utils";

export const DuelLobbyDialogContent = ({ game, setOpen }: { game: ComponentValue<Schema, Game>, setOpen: React.Dispatch<React.SetStateAction<boolean>>, open: boolean }) => {
    const {
        account: { account },
        setup: {
            systemCalls: {
                delete_duel_lobby,
                leave_duel_lobby,
                ready_duel_lobby,
                start_duel_lobby
            },
        },
    } = useDojo();

    const { builder } = useBuilder({ gameId: game.id, playerId: account?.address })
    const { builders } = useBuilders({ gameId: game.id })

    const readyPlayers = useMemo(() => Number(game.players), [game.players])

    const isHost = useMemo(() => builder?.index === 0, [builder?.index])
    const isHostReady = useMemo(() => readyPlayers === 1 || readyPlayers === 3, [readyPlayers])
    const isOpponentReady = useMemo(() => readyPlayers === 2 || readyPlayers === 3, [readyPlayers])
    const isSelfReady = useMemo(() => (isHost && isHostReady) || (!isHost && isOpponentReady), [isHost, isHostReady, isOpponentReady])

    const [loading, setLoading] = useState(false)


    const handleQuit = useCallback(async () => {
        if (game.players > 0 && isHost) return toast.error("Failed to leave - room is not empty with unreadied host");

        setLoading(true)
        const quitFunction = isHost ? delete_duel_lobby : leave_duel_lobby

        await quitFunction({
            account: account,
            mode: new Mode(ModeType.Duel),
            game_id: game.id
        }).then(success => success && setOpen(false))
            .catch(error => console.error(error))
            .finally(() => setLoading(false))
    }, [game.players, game.id, isHost, delete_duel_lobby, leave_duel_lobby, account, setOpen])

    const handleReady = useCallback(async () => {
        setLoading(true)
        await ready_duel_lobby({
            account: account,
            mode: new Mode(ModeType.Duel),
            game_id: game.id,
            status: !isSelfReady
        }).then(success => success && setOpen(false))
            .catch(error => console.error(error))
            .finally(() => setLoading(false))
    }, [ready_duel_lobby, account, game.id, isSelfReady, setOpen])

    const handleStart = useCallback(async () => {
        setLoading(true)
        await start_duel_lobby({
            account: account,
            mode: new Mode(ModeType.Duel),
            game_id: game.id
        }).then(success => success && setOpen(false))
            .catch(error => console.error(error))
            .finally(() => setLoading(false))
    }, [game.id, start_duel_lobby, account, setOpen])

    const challengers = useMemo(() =>
        builders.filter(builder => builder.player_id !== account?.address && builder.score > 0),
        [account?.address, builders]
    )

    return (
        <>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Duel Lobby</AlertDialogTitle>
                    <AlertDialogDescription className="truncate max-w-[400px]">
                        <p>{game?.name?.toString() ?? "N/A"}</p>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex gap-2">
                    <div>
                        <p>LENGTH</p>
                        <Input className="text-center" value={formatTime(game.getEndDate())} disabled />
                    </div>
                    <div>
                        <p>STAKE</p>
                        <Input className="text-center" value={`${Number(game.price) / 1e18}L`} disabled />
                    </div>
                </div>
                <div className="flex gap-1">
                    <div className="flex items-center justify-center py-2 border-2 w-full">
                        <div className="flex items-center space-x-4 w-full">
                            <span className="flex-1 text-center whitespace-nowrap overflow-hidden text-ellipsis">Host</span>
                            <div className="self-stretch border-l-2 border-gray-300 my-0.5"></div>
                            <span className={cn("flex-1 text-center whitespace-nowrap overflow-hidden text-ellipsis", readyPlayers === 1 || readyPlayers === 3 ? "text-constructive" : "text-destructive")}>
                                {readyPlayers === 1 || readyPlayers === 3 ? "Ready" : "Not Ready"}
                            </span>
                        </div>
                    </div>
                    <Button className="px-2 collapse" variant="destructive">
                        <FontAwesomeIcon className="justify-center self-center size-8" icon={faXmark} />
                    </Button>
                </div>
                {challengers.length > 0 ? (
                    challengers.map((challenger, index) => (
                        <div key={index} className="flex gap-1">
                            <div className="flex items-center justify-center py-2 border-2 w-full">
                                <div className="flex items-center space-x-4 w-full">
                                    <span className="flex-1 text-center whitespace-nowrap overflow-hidden text-ellipsis">Challenger</span>
                                    <div className="self-stretch border-l-2 border-gray-300 my-0.5"></div>
                                    <span className={cn("flex-1 text-center whitespace-nowrap overflow-hidden text-ellipsis", readyPlayers === 2 || readyPlayers === 3 ? "text-constructive" : "text-destructive")}>
                                        {readyPlayers === 2 || readyPlayers === 3 ? "Ready" : "Not Ready"}
                                    </span>
                                </div>
                            </div>
                            <Button className={cn("px-2", !isHost && "collapse")} variant="destructive">
                                <FontAwesomeIcon className="justify-center self-center size-8" icon={faXmark} />
                            </Button>
                        </div>
                    ))
                ) : (
                    <p className="text-center">Awaiting Challenger...</p>
                )}
                <AlertDialogFooter>
                    <Button disabled={loading} onClick={handleQuit}>{isHost ? "Quit" : "Leave"}</Button>
                    <Button disabled={loading} onClick={handleReady}>{!isSelfReady ? "Ready" : "Unready"}</Button>
                    {isHost && <Button onClick={handleStart} disabled={loading || readyPlayers !== 3}>Start</Button>}
                </AlertDialogFooter>
            </AlertDialogContent>
        </>
    )
}
