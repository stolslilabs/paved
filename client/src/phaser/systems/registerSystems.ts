import { PhaserLayer } from "..";
import { mapSystem } from "./mapSystem";
import { camera } from "./camera";
import { placeTile } from "./placeTile";

export const registerSystems = (layer: PhaserLayer) => {
    mapSystem(layer);
    camera(layer);
    placeTile(layer);
};
