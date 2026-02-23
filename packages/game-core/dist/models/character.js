export class Character {
    game_id;
    player_id;
    index;
    tile_id;
    spot;
    weight;
    power;
    constructor(data) {
        this.game_id = data.game_id;
        this.player_id = `0x${BigInt(data.player_id).toString(16)}`;
        this.index = data.index;
        this.tile_id = data.tile_id;
        this.spot = data.spot;
        this.weight = data.weight;
        this.power = data.power;
    }
}
//# sourceMappingURL=character.js.map