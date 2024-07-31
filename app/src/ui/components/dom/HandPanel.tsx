import { useDojo } from "@/dojo/useDojo";
import { useBuilder } from "@/hooks/useBuilder";
import { useGame } from "@/hooks/useGame";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useTile } from "@/hooks/useTile";
import { useCallback, useMemo, useState } from "react";
import { getImage } from "@/dojo/game";
import { useGameStore } from "@/store";
import { Spot } from "../Spot";
import { IngameButton } from "./IngameButton";
import rotateIcon from "/assets/icons/rotate.svg";
import confirmIcon from "/assets/icons/confirm.svg";

export const HandPanel = () => {
    const orientation: number = 1
    const [rotation, setRotation] = useState(0);
    const { gameId } = useQueryParams();
    const {
        account: { account },
    } = useDojo();

    const { game } = useGame({ gameId });
    const { builder } = useBuilder({ gameId, playerId: account?.address });

    const { tileKey, model: tile } = useTile({
        gameId,
        tileId: builder?.tile_id || 0,
    });

    const { character } = useGameStore();

    const spots = useMemo(
        () => ["NW", "W", "SW", "N", "C", "S", "NE", "E", "SE"],
        [],
    );

    const getRotatedIndex = useCallback(
        (index: number) => {
            // Anti rotate the index accordingly to the orientation
            switch (orientation) {
                case 1:
                    return index;
                case 2:
                    switch (index) {
                        case 0:
                            return 6;
                        case 1:
                            return 3;
                        case 2:
                            return 0;
                        case 3:
                            return 7;
                        case 5:
                            return 1;
                        case 6:
                            return 8;
                        case 7:
                            return 5;
                        case 8:
                            return 2;
                        default:
                            return index;
                    }
                case 3:
                    switch (index) {
                        case 0:
                            return 8;
                        case 1:
                            return 7;
                        case 2:
                            return 6;
                        case 3:
                            return 5;
                        case 5:
                            return 3;
                        case 6:
                            return 2;
                        case 7:
                            return 1;
                        case 8:
                            return 0;
                        default:
                            return index;
                    }
                case 4:
                    switch (index) {
                        case 0:
                            return 2;
                        case 1:
                            return 5;
                        case 2:
                            return 8;
                        case 3:
                            return 1;
                        case 5:
                            return 7;
                        case 6:
                            return 0;
                        case 7:
                            return 3;
                        case 8:
                            return 6;
                        default:
                            return index;
                    }
                default:
                    return index;
            }
        },
        [orientation],
    );

    return (
        <div className="col-start-3 row-start-4 flex flex-row justify-end gap-2">
            <div className="flex flex-col gap-2 self-center">
                <IngameButton icon={rotateIcon} />
                <IngameButton icon={confirmIcon} />
            </div>
            <div
                className="relative aspect-square h-full cursor-pointer bg-cover bg-center"
                style={{
                    backgroundImage: `url(${getImage(tile)})`,
                    transform: `rotate(${rotation}deg)`,
                }}
            >
                {character !== 0 && (
                    <div className="w-full h-full p-0 absolute grid grid-rows-3 grid-flow-col justify-items-center items-center">
                        {spots.map((_spot, index) => (
                            <Spot key={index} index={getRotatedIndex(index)} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
