import { Game } from "@/dojo/game/models/game"
import { Mode, ModeType } from "@/dojo/game/types/mode"
import { useDojo } from "@/dojo/useDojo"
import { Button } from "@/ui/elements/button"
import { DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/elements/dialog"
import { ComponentValue, Schema } from "@dojoengine/recs"
import { useCallback, useState } from "react"
import { toast } from "sonner"

export const DuelJoinDialogContent = ({ game }: { game: ComponentValue<Schema, Game> }) => {
    const {
        account: { account },
        setup: {
            systemCalls: {
                join_duel_lobby
            },
        },
    } = useDojo();

    const [loading, setLoading] = useState(false)

    const handleJoin = useCallback(async () => {
        if (game.player_count === 2) return toast.error("Failed to join - room is full");

        setLoading(true)
        await join_duel_lobby({
            account: account,
            mode: new Mode(ModeType.Duel),
            game_id: game.id,
            amount: Number(game.price) / 1e18
        }).catch((error) => console.error(error))
            .finally(() => setLoading(false))
    }, [account, game.id, game.player_count, game.price, join_duel_lobby])

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Join Duel?</DialogTitle>
                <DialogDescription>
                    You are about to join {game.name}.
                    <br />
                    <br />
                    The entry price is {Number(game.price) / 1e18 || "0"}L.
                    <br />
                    <br />
                    The amount will be refunded if you are kicked or leave the lobby.
                </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-1">
                <DialogClose asChild>
                    <Button disabled={loading} onClick={handleJoin} type="button">
                        Join
                    </Button>
                </DialogClose>
                <DialogClose asChild>
                    <Button type="button" variant="secondary">
                        Close
                    </Button>
                </DialogClose>
            </DialogFooter>
        </DialogContent>
    )
}