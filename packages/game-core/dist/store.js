export class Store {
    gameId;
    tiles;
    constructor(gameId, tiles) {
        this.gameId = gameId;
        this.tiles = tiles;
    }
    getTileById(tileId) {
        return this.tiles[`${this.gameId}-${tileId}`];
    }
    getTileByPosition(x, y) {
        return this.tiles[`${this.gameId}-${x}-${y}`];
    }
}
//# sourceMappingURL=store.js.map