import React, { useState } from "react";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { useDojo } from "./hooks/useDojo";
import { Button } from "./button";
import { useEffect } from "react";
import { useGameIdStore } from "../store";

interface TProps {}

export const Build = (props: TProps) => {
    const [ orientation, setOrientation ] = useState(1);
    const [ x, setX ] = useState(0x7fffffff);
    const [ y, setY ] = useState(0x7fffffff);
    const gameId = useGameIdStore((state: any) => state.gameId);
    const {
        account: { account, isDeploying },
        components: { Game, Builder, Tile, TilePosition },
        systemCalls: { build },
    } = useDojo();

    const builderId = getEntityIdFromKeys([
        BigInt(gameId),
        BigInt(account.address),
    ]) as Entity;
    const builder = useComponentValue(Builder, builderId);

    const tileId = getEntityIdFromKeys([
        BigInt(gameId),
        BigInt(builder ? builder.tile_id : 0),
    ]) as Entity;
    const tile = useComponentValue(Tile, tileId);

    if (!account || !builder) return <></>;

    return (
        <div className="flex flex-col">
            <div className="flex space-x-3 justify-between p-2 flex-wrap">
                <Button
                    variant={"default"}
                    onClick={async () => {
                        await build({
                            signer: account,
                            game_id: gameId,
                            tile_id: builder.tile_id,
                            orientation: orientation,
                            x: x,
                            y: y,
                        });
                    }}
                >
                    Build
                </Button>
            </div>
            <div className="flex flex-col w-36 p-2 gap-1">
                <div>{`Tile plan: ${tile ? tile.plan : 'None'}`}</div>
                <label>Orientation</label>
                <input type="number" value={orientation} onChange={(e) => setOrientation(parseInt(e.target.value))} />
                <label>Position</label>
                <input type="number" value={x} onChange={(e) => setX(parseInt(e.target.value))} />
                <input type="number" value={y} onChange={(e) => setY(parseInt(e.target.value))} />
            </div>
        </div>
    );
};
