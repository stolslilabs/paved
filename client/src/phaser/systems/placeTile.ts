import {
    Entity,
    Has,
    defineSystem,
    defineEnterSystem,
    getComponentValueStrict,
} from "@dojoengine/recs";
import { PhaserLayer } from "..";
import { tileCoordToPixelCoord } from "@latticexyz/phaserx";
import { Animations, TILE_HEIGHT, TILE_WIDTH, ORIGIN_OFFSET } from "../config/constants";

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

    // defineEnterSystem(world, [Has(Tile)], ({ entity }: any) => {
        // const tileComponent = getComponentValueStrict(
        //     Tile,
        //     entity.toString() as Entity
        // );

        // if (!tileComponent || tileComponent.orientation === 0) return;
        // console.log('defineEnterSystem', tileComponent);

        // const animation = Object.values(Animations)[tileComponent ? tileComponent.plan : 0];

        // const tile = objectPool.get(entity.toString(), "Sprite");
        // tile.setComponent({
        //     id: "position",
        //     once: (sprite: any) => {
        //         sprite.setOrigin(1, 1);
        //         sprite.angle = (tileComponent.orientation - 1) * 90;
        //         sprite.play(animation);
        //     },
        // });
    // });

    defineSystem(world, [Has(Tile)], ({ entity }: any) => {
        const tileComponent = getComponentValueStrict(
            Tile,
            entity.toString() as Entity
        );

        if (!tileComponent || tileComponent.orientation === 0) return;
        console.log('defineSystem', tileComponent);

        const animation = Object.values(Animations)[tileComponent ? tileComponent.plan : 0];
        console.log(animation);

        // TODO: remove offset when we can store i32 on the SC side
        const offsetPosition = { x: ORIGIN_OFFSET, y: ORIGIN_OFFSET };
        const fixedPosition = { x: tileComponent.x + offsetPosition.x, y: tileComponent.y + offsetPosition.y }

        const pixelPosition = tileCoordToPixelCoord(
            fixedPosition,
            TILE_WIDTH,
            TILE_HEIGHT
        );

        const tile = objectPool.get(entity, "Sprite");

        tile.setComponent({
            id: "position",
            once: (sprite: any) => {
                sprite.setOrigin(0.5, 0.5);
                sprite.angle = (tileComponent.orientation - 1) * 90;
                sprite.play(animation);
                sprite.setPosition(pixelPosition?.x, pixelPosition?.y);
                console.log(sprite)
                // camera.centerOn(pixelPosition?.x, pixelPosition?.y);
            },
        });
    });
};
