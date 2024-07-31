import { getAvailableCharacters } from "@/dojo/game";
import { useMemo } from "react";
import { useDojo } from "@/dojo/useDojo";
import { useBuilder } from "@/hooks/useBuilder";
import { useQueryParams } from "@/hooks/useQueryParams";
import { Character } from "../Character";

export const CharacterMenu = () => {
    const { gameId } = useQueryParams();
    const {
        account: { account },
    } = useDojo();

    const { builder } = useBuilder({
        gameId: gameId,
        playerId: account?.address,
    });

    const characters = useMemo(
        () => getAvailableCharacters(builder ? builder.characters : 0),
        [builder],
    );

    return (
        <div className="row-span-3 flex flex-col items-end justify-center gap-4">
            {characters.map(({ status }, index) => (
                /* TODO: Refactor Character component */
                <Character key={index} index={index} enable={status} />
            ))}
        </div>
    )
}