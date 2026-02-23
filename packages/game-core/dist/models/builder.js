export class Builder {
    game_id;
    player_id;
    tile_id;
    characters;
    constructor(builder) {
        this.game_id = builder.game_id;
        this.player_id = `0x${BigInt(builder.player_id).toString(16)}`;
        this.tile_id = builder.tile_id;
        this.characters = builder.characters;
    }
}
//# sourceMappingURL=builder.js.map