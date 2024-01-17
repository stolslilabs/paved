import React, { useState } from "react";
import { useDojo } from "../../dojo/useDojo";
import { useComponentValue } from "@dojoengine/react";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import { Entity } from "@dojoengine/recs";
import { Event, InvokeTransactionReceiptResponse, shortString } from 'starknet';
import { Button } from "@/components/ui/button"
import { useUIStore } from "../../store";
import { useGameIdStore } from "../../store";
import { getImage } from "../../utils";

export const TileMenu = () => {
    const [rotation, setRotation] = useState(0);
    const [backgroundImage, setBackgroundImage] = useState(getImage(0));

    const {
      account: { account },
      setup: {
        clientComponents: { Builder, Tile, TilePosition },
      },
    } = useDojo();
    const gameId = useGameIdStore((state: any) => state.gameId);

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

    // if (!account || !builder) return <></>;

    return (
        <div className="h-64 w-64 flex justify-center items-center">
            <div className="grid grid-rows-3 grid-flow-col gap-4 h-full w-full">
                <div className="row-start-2 row-span-1 col-span-1 border-2 flex justify-center items-center bg-white">REM</div>
                <div className="row-span-1 col-span-1 border-2 flex justify-center items-center bg-white">CON</div>
                <div className="row-span-1 col-span-1 border-2 flex justify-center items-center bg-white">BRN</div>
                <div className="row-span-2 col-span-2 border-2 flex justify-center items-center bg-white">HAND</div>
                <div className="row-span-1 col-span-1 border-2 flex justify-center items-center bg-white">ROT</div>
            </div>
        </div>
    );
};
