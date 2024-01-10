import {
    Entity,
    Has,
    defineSystem,
    defineEnterSystem,
    getComponentValueStrict,
} from "@dojoengine/recs";
import { PhaserLayer } from "..";
import { tileCoordToPixelCoord } from "@latticexyz/phaserx";
import { Animations, TILE_HEIGHT, TILE_WIDTH } from "../config/constants";

export const placeTile = (layer: PhaserLayer) => {
    const {
        world,
        scenes: {
            Main: { objectPool, camera },
        },
        networkLayer: {
            components: { Tile },
        },
    } = layer;

    // system loops over entities and sets them on the map according to their values

    defineEnterSystem(world, [Has(Tile)], ({ entity }: any) => {
        const tile = objectPool.get(entity.toString(), "Sprite");

        const position = getComponentValueStrict(
            Tile,
            entity.toString() as Entity
        );

        const animation = Object.values(Animations)[position ? position.plan : 0];

        tile.setComponent({
            id: "animation",
            once: (sprite: any) => {
                console.log(sprite);
                sprite.play(animation);
            },
        });
    });

    defineSystem(world, [Has(Tile)], ({ entity }: any) => {
        console.log(entity);

        const position = getComponentValueStrict(
            Tile,
            entity.toString() as Entity
        );

        // TODO: remove offset when we can store i32 on the SC side
        const offsetPosition = { x: -0x7fffffff, y: -0x7fffffff };
        const fixedPosition = { x: position.x + offsetPosition.x, y: position.y + offsetPosition.y }

        const pixelPosition = tileCoordToPixelCoord(
            fixedPosition,
            TILE_WIDTH,
            TILE_HEIGHT
        );

        const player = objectPool.get(entity, "Sprite");

        player.setComponent({
            id: "position",
            once: (sprite: any) => {
                sprite.setPosition(pixelPosition?.x, pixelPosition?.y);
                camera.centerOn(pixelPosition?.x, pixelPosition?.y);
            },
        });
    });
};
