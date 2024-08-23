import * as THREE from "three";

type Tile2DCoordinates = {
    x: number;
    y: number;
}

type MarkedTileTextPosition = THREE.Vector2

type PresetTransaction = {
    orientation?: number,
    role?: number,
    spot?: number,
    tile_id: number,
    x: number,
    y: number
}

export class TutorialStage {
    markedTile: Tile2DCoordinates;
    presetTransaction: PresetTransaction;
    interactionText: Map<string, string>;
    textboxText: string;
    initialOrientation?: number;
    markedTileTextPosition: MarkedTileTextPosition

    constructor(markedTile: Tile2DCoordinates, presetTransaction: PresetTransaction, interactionText: Map<string, string>, textboxText: string, initialOrientation: number = 1, markedTileTextPosition: THREE.Vector2 = new THREE.Vector2(-1, 0)) {
        this.markedTile = markedTile;
        this.presetTransaction = presetTransaction;
        this.interactionText = interactionText;
        this.textboxText = textboxText;
        this.initialOrientation = initialOrientation;
        this.markedTileTextPosition = markedTileTextPosition;
    }
}

export const TUTORIAL_STAGES = [
    new TutorialStage(
        { x: -3, y: 0 },
        {
            orientation: 1,
            role: 0,
            spot: 0,
            tile_id: 2,
            x: 2147483646,
            y: 2147483647
        },
        new Map([
            ["tile-ingame", "Click the highlighted square to locate the tile"],
            ["confirm-button", "Click the Confirm button to place the tile"]
        ]),
        "FADED TILE AND HIGHLIGHTED AREAS FOR TUTORIAL PURPOSES ONLY. PLEASE FOLLOW INSTRUCTIONS TO MOVE TO THE NEXT STEPS.",
    ),
    new TutorialStage(
        { x: -3, y: -3 },
        {
            orientation: 2,
            role: 4,
            tile_id: 3,
            x: 2147483646,
            y: 2147483646
        },
        new Map([
            ["tile-ingame", "Click the highlighted square to locate the tile"],
            ["paladin-button", "Select the Paladin"],
            ["tile-preview", "Locate the Paladin within the city"],
            ["confirm-button", "Confirm tile placement"]
        ]),
        "CERTAIN CHARACTERS SCORE BONUSES FOR CERTAIN STRUCTURES, CHOOSE WISELY TO MAXIMISE YOUR SCORE.",
        2,
        new THREE.Vector2(-.25, -1)
    ),
    new TutorialStage(
        { x: -3, y: -6 },
        {
            orientation: 2,
            role: 0,
            spot: 0,
            tile_id: 4,
            x: 2147483646,
            y: 2147483645
        },
        new Map([
            ["rotate-button", "Rotate the tile to match example placement"],
            ["tile-ingame", "Click the highlighted square to locate the tile"],
            ["confirm-button", "Confirm tile placement to close the structure and score your Paladins points"],
        ]),
        "CHARACTERS WILL BE GREYED OUT WHEN IN USE AND A MARKER IS DISPLAYED ON THE GAME BOARD.",
        3,

    ),
    new TutorialStage(
        { x: 0, y: -3 },
        {
            orientation: 4,
            role: 5,
            tile_id: 5,
            x: 2147483647,
            y: 2147483646
        },
        new Map([
            ["tile-ingame", "Click the highlighted square to locate the tile"],
            ["pilgrim-button", "Select the Pilgrim"],
            ["tile-preview", "Locate the Pilgrim within the city"],
            ["confirm-button", "Confirm tile placement"]
        ]),
        "BE SURE TO USE YOUR CHARACTERS WISELY, YOU MAY FIND YOU PLAY THEM TOO EARLY AND MISS OUT ON UPCOMING STRUCTURES.",
        4,
        new THREE.Vector2(.35, 0)
    ),
    new TutorialStage(
        { x: 0, y: -6 },
        {
            orientation: 2,
            role: 0,
            spot: 0,
            tile_id: 6,
            x: 2147483647,
            y: 2147483645
        },
        new Map(),
        ""
    ),
    new TutorialStage(
        { x: 3, y: -6 },
        {
            orientation: 1,
            role: 0,
            spot: 0,
            tile_id: 7,
            x: 2147483648,
            y: 2147483645
        },
        new Map(),
        ""
    ),
    new TutorialStage(
        { x: 3, y: -3 },
        {
            role: 0,
            spot: 0,
            tile_id: 8,
            x: 2147483648,
            y: 2147483646
        },
        new Map(),
        ""
    ),
    new TutorialStage(
        { x: 3, y: 0 },
        {
            orientation: 4,
            role: 0,
            spot: 0,
            tile_id: 9,
            x: 2147483648,
            y: 2147483647
        },
        new Map(),
        ""
    )
]