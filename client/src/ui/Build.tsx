import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useDojo } from "./hooks/useDojo";
import { Button } from "./button";
import { useEffect } from "react";
import { useGameIdStore } from "../store";

interface TProps {
    orientation: number;
    x: number;
    y: number;
}

export const Build = (props: TProps) => {
    const gameId = useGameIdStore((state: any) => state.gameId);
    const {
        account: { account, isDeploying },
        components: { Game, Builder, Tile, TilePosition },
        systemCalls: { build },
    } = useDojo();

    const builderId = getEntityIdFromKeys([BigInt(gameId), BigInt(account.address)]) as Entity;
    const builder = useComponentValue(Builder, builderId);

    useEffect(() => {
        if (isDeploying) {
            return;
        }

        if (account) {
            return;
        }
    }, [account]);

    if (!account || !builder) return <></>;

    return (
        <div className="flex space-x-3 justify-between p-2 flex-wrap">
            <Button
                variant={"default"}
                onClick={async () => {
                    await build({
                        signer: account,
                        game_id: gameId,
                        tile_id: builder.tile_id,
                        orientation: props.orientation,
                        x: props.x,
                        y: props.y,
                    });
                }}
            >
                Build
            </Button>
        </div>
    );
};
