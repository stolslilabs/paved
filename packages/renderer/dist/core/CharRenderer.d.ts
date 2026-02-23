import * as THREE from "three";
import type { CharacterRenderData } from "./types";
export declare class CharRenderer {
    private group;
    private charMeshes;
    private radius;
    private height;
    private squareSize;
    constructor(radius?: number, height?: number, squareSize?: number);
    getGroup(): THREE.Group;
    updateCharacters(characters: CharacterRenderData[]): void;
    private createCharacter;
    /** Call each frame to make billboard discs face the camera */
    updateBillboards(camera: THREE.Camera): void;
    private disposeMesh;
    dispose(): void;
}
//# sourceMappingURL=CharRenderer.d.ts.map