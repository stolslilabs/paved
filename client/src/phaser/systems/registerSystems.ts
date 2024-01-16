import { PhaserLayer } from "..";
import { mapSystem } from "./mapSystem";
import { camera } from "./camera";
import { placeTile } from "./placeTile";
import { createControlsSystem } from "./createControlsSystem";

export const registerSystems = (layer: PhaserLayer) => {
    // mapSystem(layer);
    camera(layer);
    createControlsSystem(layer);
    placeTile(layer);
};
