export declare const CHARACTER_COUNT = 5;
export declare const ORDER_COUNT = 14;
export declare const getSpotFromIndex: (index: number) => number;
export declare const getIndexFromSpot: (spot: number) => number;
export declare const getCharacters: () => string[];
export declare enum Characters {
    Lord = 0,
    Lady = 1,
    Adventurer = 2,
    Paladin = 3,
    Pilgrim = 4,
    Woodsman = 5,
    Herdsman = 6
}
export declare const getAvailableCharacters: (packed: number) => {
    character: string;
    status: boolean;
}[];
export declare const getRole: (index: number) => string;
export declare const getBoost: (index: number) => string;
export declare const getRoleAllowedSpots: (index: number) => string[];
export declare const getCharacterFromIndex: (index: number) => number;
export declare const getIndexFromCharacter: (character: number) => number;
export declare const getColorFromCharacter: (character: number) => string;
export declare const getColor: (str: string) => string;
export declare const offset = 2147483647;
export declare const other_offset = 0;
//# sourceMappingURL=utils.d.ts.map